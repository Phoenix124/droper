import { randomUUID } from 'node:crypto';
import { isWebLink } from './fileNames.js';
import { baseName } from './shelfStore.js';

export type ClipContent =
  | { kind: 'text'; text: string }
  | { kind: 'files'; files: string[] }
  | { kind: 'image'; imagePath: string; signature: string };

export type ClipKind = 'text' | 'link' | 'files' | 'image';

export interface ClipEntry {
  id: string;
  kind: ClipKind;
  text?: string;
  files?: string[];
  imagePath?: string;
  preview: string;
  signature: string;
  createdAt: number;
  pinned: boolean;
}

export interface ClipState {
  entries: ClipEntry[];
}

export interface ClipboardHistoryOptions {
  read: () => ClipContent | null;
  limit?: number;
  persistence?: { load(): ClipState | null; save(state: ClipState): void };
  idGen?: () => string;
  now?: () => number;
  /** Called for every entry that leaves the history (removed, cleared or trimmed). */
  onDiscard?: (entry: ClipEntry) => void;
}

function signatureOf(c: ClipContent): string {
  switch (c.kind) {
    case 'text': return `t:${c.text}`;
    case 'files': return `f:${c.files.join('\n')}`;
    case 'image': return `i:${c.signature}`;
  }
}

/** Records clipboard changes by polling; newest entry first, pinned entries survive limits and clears. */
export class ClipboardHistory {
  private list: ClipEntry[];
  private lastSignature: string | null = null;
  private limit: number;
  private listeners = new Set<() => void>();

  constructor(private readonly opts: ClipboardHistoryOptions) {
    this.limit = opts.limit ?? 50;
    const loaded = opts.persistence?.load();
    this.list = Array.isArray(loaded?.entries) ? loaded.entries : [];
  }

  entries(): ClipEntry[] {
    return this.list.map((e) => ({ ...e }));
  }

  setLimit(limit: number): void {
    this.limit = limit;
    if (this.trim()) this.commit();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Remember current clipboard as already seen, so enabling history doesn't record stale content. */
  prime(): void {
    const c = this.opts.read();
    this.lastSignature = c ? signatureOf(c) : null;
  }

  poll(): ClipEntry | null {
    const content = this.opts.read();
    if (!content) return null;
    const signature = signatureOf(content);
    if (signature === this.lastSignature) return null;
    this.lastSignature = signature;
    const entry = this.toEntry(content, signature);
    if (!entry) return null;
    const existing = this.list.find((e) => e.signature === signature);
    if (existing) {
      this.list = [existing, ...this.list.filter((e) => e !== existing)];
      existing.createdAt = entry.createdAt;
      this.commit();
      return { ...existing };
    }
    this.list.unshift(entry);
    this.trim();
    this.commit();
    return { ...entry };
  }

  setPinned(id: string, pinned: boolean): void {
    const e = this.list.find((x) => x.id === id);
    if (!e || e.pinned === pinned) return;
    e.pinned = pinned;
    this.commit();
  }

  remove(id: string): void {
    this.drop((e) => e.id === id);
  }

  clear({ includePinned = false } = {}): void {
    this.drop((e) => includePinned || !e.pinned);
  }

  private drop(predicate: (e: ClipEntry) => boolean): void {
    const gone = this.list.filter(predicate);
    if (!gone.length) return;
    this.list = this.list.filter((e) => !predicate(e));
    this.commit();
    for (const e of gone) this.opts.onDiscard?.(e);
  }

  private toEntry(c: ClipContent, signature: string): ClipEntry | null {
    const base = { id: (this.opts.idGen ?? randomUUID)(), signature, createdAt: (this.opts.now ?? Date.now)(), pinned: false };
    switch (c.kind) {
      case 'text': {
        const trimmed = c.text.trim();
        if (!trimmed) return null;
        return { ...base, kind: isWebLink(trimmed) ? 'link' : 'text', text: c.text, preview: trimmed.slice(0, 200) };
      }
      case 'files':
        if (!c.files.length) return null;
        return { ...base, kind: 'files', files: [...c.files], preview: c.files.map(baseName).join(', ') };
      case 'image':
        return { ...base, kind: 'image', imagePath: c.imagePath, preview: 'Image' };
    }
  }

  private trim(): boolean {
    let unpinned = 0;
    const kept = this.list.filter((e) => e.pinned || ++unpinned <= this.limit);
    const gone = this.list.filter((e) => !kept.includes(e));
    this.list = kept;
    for (const e of gone) this.opts.onDiscard?.(e);
    return gone.length > 0;
  }

  private commit(): void {
    this.opts.persistence?.save({ entries: this.list });
    for (const l of this.listeners) l();
  }
}
