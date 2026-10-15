import { describe, it, expect, beforeEach } from 'vitest';
import { ShelfStore, type ShelfState } from '../src/core/shelfStore';

function memoryPersistence(initial: ShelfState | null = null) {
  let saved: ShelfState | null = initial;
  return {
    load: () => saved,
    save: (s: ShelfState) => { saved = structuredClone(s); },
    get saved() { return saved; },
  };
}

describe('ShelfStore', () => {
  let existing: Set<string>;
  let discarded: string[];
  let persistence: ReturnType<typeof memoryPersistence>;
  let store: ShelfStore;
  let n = 0;

  beforeEach(() => {
    existing = new Set(['/a/one.txt', '/a/two.png', '/b/three.pdf']);
    discarded = [];
    persistence = memoryPersistence();
    n = 0;
    store = new ShelfStore({
      persistence,
      exists: (p) => existing.has(p),
      onDiscard: (item) => discarded.push(item.id),
      idGen: () => `id${++n}`,
      now: () => 1000,
    });
  });

  it('adds file paths as items with basename as name', () => {
    const added = store.addPaths(['/a/one.txt', '/a/two.png']);
    expect(added.map((i) => i.name)).toEqual(['one.txt', 'two.png']);
    expect(store.items()).toHaveLength(2);
    expect(store.items()[0]).toMatchObject({ kind: 'file', paths: ['/a/one.txt'], locked: false, snippet: false, addedAt: 1000 });
  });

  it('handles windows-style paths for names', () => {
    const [item] = store.addPaths(['C:\\Users\\me\\doc.txt']);
    expect(item.name).toBe('doc.txt');
  });

  it('skips paths already on the shelf', () => {
    store.addPaths(['/a/one.txt']);
    const added = store.addPaths(['/a/one.txt', '/a/two.png']);
    expect(added.map((i) => i.name)).toEqual(['two.png']);
    expect(store.items()).toHaveLength(2);
  });

  it('marks snippet items', () => {
    const [item] = store.addPaths(['/a/one.txt'], { snippet: true });
    expect(item.snippet).toBe(true);
  });

  it('persists on every change and reloads state', () => {
    store.addPaths(['/a/one.txt']);
    expect(persistence.saved?.items).toHaveLength(1);
    const reloaded = new ShelfStore({ persistence, exists: () => true });
    expect(reloaded.items().map((i) => i.paths[0])).toEqual(['/a/one.txt']);
  });

  it('notifies listeners on change', () => {
    let calls = 0;
    store.onChange(() => calls++);
    store.addPaths(['/a/one.txt']);
    expect(calls).toBe(1);
  });

  it('removes items but keeps locked ones unless forced', () => {
    const [a, b] = store.addPaths(['/a/one.txt', '/a/two.png']);
    store.setLocked([a.id], true);
    const removed = store.remove([a.id, b.id]);
    expect(removed.map((i) => i.id)).toEqual([b.id]);
    expect(store.items().map((i) => i.id)).toEqual([a.id]);
    store.remove([a.id], { force: true });
    expect(store.items()).toHaveLength(0);
  });

  it('clear removes unlocked items, or all with includeLocked', () => {
    const [a] = store.addPaths(['/a/one.txt', '/a/two.png']);
    store.setLocked([a.id], true);
    store.clear();
    expect(store.items().map((i) => i.id)).toEqual([a.id]);
    store.clear({ includeLocked: true });
    expect(store.items()).toHaveLength(0);
  });

  it('restores the last removed batch', () => {
    const [a, b] = store.addPaths(['/a/one.txt', '/a/two.png']);
    store.remove([a.id, b.id]);
    const restored = store.restoreLastRemoved();
    expect(restored.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(store.items()).toHaveLength(2);
    expect(store.restoreLastRemoved()).toEqual([]);
  });

  it('discards the previous removed batch when a new one is removed', () => {
    const [a, b] = store.addPaths(['/a/one.txt', '/a/two.png']);
    store.remove([a.id]);
    expect(discarded).toEqual([]);
    store.remove([b.id]);
    expect(discarded).toEqual([a.id]);
  });

  it('does not discard a restored item', () => {
    const [a, b] = store.addPaths(['/a/one.txt', '/a/two.png']);
    store.remove([a.id]);
    store.restoreLastRemoved();
    store.remove([b.id]);
    expect(discarded).toEqual([]);
  });

  it('merges items into a stack at the position of the first one', () => {
    const [a, b, c] = store.addPaths(['/a/one.txt', '/a/two.png', '/b/three.pdf']);
    const stack = store.mergeToStack([b.id, c.id]);
    expect(stack).toMatchObject({ kind: 'stack', paths: ['/a/two.png', '/b/three.pdf'] });
    expect(store.items().map((i) => i.id)).toEqual([a.id, stack!.id]);
  });

  it('merging a stack flattens its paths', () => {
    const [a, b, c] = store.addPaths(['/a/one.txt', '/a/two.png', '/b/three.pdf']);
    const s1 = store.mergeToStack([a.id, b.id])!;
    const s2 = store.mergeToStack([s1.id, c.id])!;
    expect(s2.paths).toEqual(['/a/one.txt', '/a/two.png', '/b/three.pdf']);
    expect(store.items()).toHaveLength(1);
  });

  it('refuses to merge fewer than two items', () => {
    const [a] = store.addPaths(['/a/one.txt']);
    expect(store.mergeToStack([a.id])).toBeNull();
  });

  it('splits a stack back into file items in place', () => {
    const [a, b, c] = store.addPaths(['/a/one.txt', '/a/two.png', '/b/three.pdf']);
    const s = store.mergeToStack([a.id, b.id])!;
    const parts = store.splitStack(s.id);
    expect(parts.map((i) => i.paths[0])).toEqual(['/a/one.txt', '/a/two.png']);
    expect(store.items().map((i) => i.paths[0])).toEqual(['/a/one.txt', '/a/two.png', c.paths[0]]);
  });

  it('flattens selected items into drag paths', () => {
    const [a, b, c] = store.addPaths(['/a/one.txt', '/a/two.png', '/b/three.pdf']);
    const s = store.mergeToStack([a.id, b.id])!;
    expect(store.pathsFor([s.id, c.id])).toEqual(['/a/one.txt', '/a/two.png', '/b/three.pdf']);
  });

  it('replaces a path after rename and updates the name', () => {
    const [a] = store.addPaths(['/a/one.txt']);
    store.replacePath(a.id, '/a/one.txt', '/a/uno.txt');
    expect(store.items()[0]).toMatchObject({ paths: ['/a/uno.txt'], name: 'uno.txt' });
  });

  it('prunes missing files and shrinks stacks', () => {
    const [a, b, c] = store.addPaths(['/a/one.txt', '/a/two.png', '/b/three.pdf']);
    const s = store.mergeToStack([b.id, c.id])!;
    existing.delete('/a/one.txt');
    existing.delete('/a/two.png');
    const pruned = store.pruneMissing();
    expect(pruned.map((i) => i.id)).toEqual([a.id]);
    expect(store.items()).toEqual([expect.objectContaining({ id: s.id, kind: 'file', paths: ['/b/three.pdf'], name: 'three.pdf' })]);
  });

  it('moves items to a new index', () => {
    const [a, b, c] = store.addPaths(['/a/one.txt', '/a/two.png', '/b/three.pdf']);
    store.move([c.id], 0);
    expect(store.items().map((i) => i.id)).toEqual([c.id, a.id, b.id]);
  });
});
