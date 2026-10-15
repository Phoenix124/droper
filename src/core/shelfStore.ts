import { randomUUID } from 'node:crypto';

export type ShelfItemKind = 'file' | 'stack';

export interface ShelfItem {
  id: string;
  kind: ShelfItemKind;
  /** Absolute paths. A file item has exactly one, a stack has two or more. */
  paths: string[];
  name: string;
  addedAt: number;
  locked: boolean;
  /** True when the file was created by Droper (dropped text, link or image) and is owned by it. */
  snippet: boolean;
}

export interface ShelfState {
  items: ShelfItem[];
  lastRemoved: ShelfItem[];
}

export interface ShelfPersistence {
  load(): ShelfState | null;
  save(state: ShelfState): void;
}

export interface ShelfStoreOptions {
  persistence: ShelfPersistence;
  exists: (path: string) => boolean;
  /** Called when a removed item can no longer be restored, so owned snippet files can be deleted. */
  onDiscard?: (item: ShelfItem) => void;
  idGen?: () => string;
  now?: () => number;
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function stackName(paths: string[]): string {
  return `${paths.length} items`;
}

export class ShelfStore {
  private state: ShelfState;
  private listeners = new Set<() => void>();
  private readonly opts: Required<Omit<ShelfStoreOptions, 'onDiscard'>> & Pick<ShelfStoreOptions, 'onDiscard'>;

  constructor(opts: ShelfStoreOptions) {
    this.opts = { idGen: randomUUID, now: Date.now, ...opts };
    const loaded = opts.persistence.load();
    this.state = {
      items: Array.isArray(loaded?.items) ? loaded.items : [],
      lastRemoved: Array.isArray(loaded?.lastRemoved) ? loaded.lastRemoved : [],
    };
  }

  items(): ShelfItem[] {
    return this.state.items.map((i) => ({ ...i, paths: [...i.paths] }));
  }

  hasRemoved(): boolean {
    return this.state.lastRemoved.length > 0;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addPaths(paths: string[], { snippet = false } = {}): ShelfItem[] {
    const known = new Set(this.state.items.flatMap((i) => i.paths));
    const added: ShelfItem[] = [];
    for (const path of paths) {
      if (known.has(path)) continue;
      known.add(path);
      added.push(this.makeItem('file', [path], snippet));
    }
    if (added.length) {
      this.state.items.push(...added);
      this.commit();
    }
    return added;
  }

  remove(ids: string[], { force = false } = {}): ShelfItem[] {
    const wanted = new Set(ids);
    const removed = this.state.items.filter((i) => wanted.has(i.id) && (force || !i.locked));
    if (!removed.length) return [];
    const gone = new Set(removed.map((i) => i.id));
    this.state.items = this.state.items.filter((i) => !gone.has(i.id));
    this.replaceRemoved(removed);
    this.commit();
    return removed;
  }

  clear({ includeLocked = false } = {}): ShelfItem[] {
    return this.remove(this.state.items.map((i) => i.id), { force: includeLocked });
  }

  /** Puts the last removed batch back, leaving out paths that were added to the shelf again meanwhile. */
  restoreLastRemoved(): ShelfItem[] {
    const batch = this.state.lastRemoved;
    if (!batch.length) return [];
    this.state.lastRemoved = [];
    const known = new Set(this.state.items.flatMap((i) => i.paths));
    const restored: ShelfItem[] = [];
    for (const item of batch) {
      const fresh = item.paths.filter((p) => !known.has(p));
      if (!fresh.length) continue;
      fresh.forEach((p) => known.add(p));
      if (fresh.length !== item.paths.length) this.setPaths(item, fresh);
      restored.push(item);
    }
    this.state.items.push(...restored);
    this.commit();
    return restored.map((i) => ({ ...i, paths: [...i.paths] }));
  }

  setLocked(ids: string[], locked: boolean): void {
    const wanted = new Set(ids);
    let changed = false;
    for (const item of this.state.items) {
      if (wanted.has(item.id) && item.locked !== locked) {
        item.locked = locked;
        changed = true;
      }
    }
    if (changed) this.commit();
  }

  mergeToStack(ids: string[]): ShelfItem | null {
    const wanted = new Set(ids);
    const members = this.state.items.filter((i) => wanted.has(i.id));
    if (members.length < 2) return null;
    const paths = members.flatMap((i) => i.paths);
    const stack = this.makeItem('stack', paths, members.every((i) => i.snippet));
    stack.locked = members.some((i) => i.locked);
    const at = this.state.items.indexOf(members[0]);
    const rest = this.state.items.filter((i) => !wanted.has(i.id));
    rest.splice(at, 0, stack);
    this.state.items = rest;
    this.commit();
    return { ...stack };
  }

  splitStack(id: string): ShelfItem[] {
    const at = this.state.items.findIndex((i) => i.id === id && i.kind === 'stack');
    if (at < 0) return [];
    const stack = this.state.items[at];
    const parts = stack.paths.map((p) => {
      const item = this.makeItem('file', [p], stack.snippet);
      item.locked = stack.locked;
      return item;
    });
    this.state.items.splice(at, 1, ...parts);
    this.commit();
    return parts;
  }

  /**
   * Takes one path out of a stack (e.g. after it was dragged out on its own). The path becomes the
   * restorable "last removed" item. Locked stacks keep their paths unless forced.
   */
  removePath(id: string, path: string, { force = false } = {}): ShelfItem | null {
    const item = this.state.items.find((i) => i.id === id);
    if (!item || item.kind !== 'stack' || (item.locked && !force) || !item.paths.includes(path)) return null;
    this.setPaths(item, item.paths.filter((p) => p !== path));
    const taken = this.makeItem('file', [path], item.snippet);
    this.replaceRemoved([taken]);
    this.commit();
    return { ...taken, paths: [...taken.paths] };
  }

  pathsFor(ids: string[]): string[] {
    const wanted = new Set(ids);
    return this.state.items.filter((i) => wanted.has(i.id)).flatMap((i) => i.paths);
  }

  replacePath(id: string, oldPath: string, newPath: string): void {
    const item = this.state.items.find((i) => i.id === id);
    const idx = item?.paths.indexOf(oldPath) ?? -1;
    if (!item || idx < 0) return;
    item.paths[idx] = newPath;
    if (item.kind === 'file') item.name = baseName(newPath);
    this.commit();
  }

  move(ids: string[], toIndex: number): void {
    const wanted = new Set(ids);
    const moving = this.state.items.filter((i) => wanted.has(i.id));
    if (!moving.length) return;
    const before = this.state.items.slice(0, toIndex).filter((i) => !wanted.has(i.id)).length;
    const rest = this.state.items.filter((i) => !wanted.has(i.id));
    rest.splice(before, 0, ...moving);
    this.state.items = rest;
    this.commit();
  }

  /** Drops items whose files no longer exist (e.g. moved to Trash). Returns fully removed items. */
  pruneMissing(): ShelfItem[] {
    const pruned: ShelfItem[] = [];
    let changed = false;
    const kept: ShelfItem[] = [];
    for (const item of this.state.items) {
      const alive = item.paths.filter((p) => this.opts.exists(p));
      if (alive.length === item.paths.length) {
        kept.push(item);
        continue;
      }
      changed = true;
      if (alive.length === 0) {
        pruned.push(item);
        continue;
      }
      this.setPaths(item, alive);
      kept.push(item);
    }
    if (changed) {
      this.state.items = kept;
      this.commit();
    }
    return pruned;
  }

  /** Replaces a stack's paths, collapsing it to a plain file item when one path is left. */
  private setPaths(item: ShelfItem, paths: string[]): void {
    item.paths = paths;
    if (paths.length === 1) {
      item.kind = 'file';
      item.name = baseName(paths[0]);
    } else {
      item.name = stackName(paths);
    }
  }

  private makeItem(kind: ShelfItemKind, paths: string[], snippet: boolean): ShelfItem {
    return {
      id: this.opts.idGen(),
      kind,
      paths,
      name: kind === 'file' ? baseName(paths[0]) : stackName(paths),
      addedAt: this.opts.now(),
      locked: false,
      snippet,
    };
  }

  private replaceRemoved(removed: ShelfItem[]): void {
    for (const old of this.state.lastRemoved) this.opts.onDiscard?.(old);
    this.state.lastRemoved = removed;
  }

  private commit(): void {
    this.opts.persistence.save(this.state);
    for (const l of this.listeners) l();
  }
}
