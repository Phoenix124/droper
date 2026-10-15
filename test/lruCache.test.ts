import { describe, it, expect } from 'vitest';
import { LruCache } from '../src/core/lruCache';

describe('LruCache', () => {
  it('evicts the least recently used entry above capacity', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
  });

  it('deletes entries matching a predicate', () => {
    const c = new LruCache<string, number>(5);
    c.set('/x|1', 1);
    c.set('/x|2', 2);
    c.set('/y|1', 3);
    c.deleteWhere((k) => k.startsWith('/x|'));
    expect(c.size).toBe(1);
  });
});
