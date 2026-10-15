import { describe, it, expect, beforeEach } from 'vitest';
import { ClipboardHistory, type ClipContent } from '../src/core/clipboardHistory';

describe('ClipboardHistory', () => {
  let current: ClipContent | null;
  let n: number;
  let saved: unknown;
  let h: ClipboardHistory;

  const make = (limit = 3) =>
    new ClipboardHistory({
      read: () => current,
      limit,
      idGen: () => `c${++n}`,
      now: () => 5,
      persistence: { load: () => null, save: (s) => { saved = s; } },
    });

  beforeEach(() => {
    current = null;
    n = 0;
    saved = undefined;
    h = make();
  });

  it('records new text content once', () => {
    current = { kind: 'text', text: 'hello' };
    expect(h.poll()?.text).toBe('hello');
    expect(h.poll()).toBeNull();
    expect(h.entries()).toHaveLength(1);
  });

  it('ignores empty clipboard and whitespace-only text', () => {
    expect(h.poll()).toBeNull();
    current = { kind: 'text', text: '   ' };
    expect(h.poll()).toBeNull();
  });

  it('keeps newest first and moves repeated copies to the top', () => {
    current = { kind: 'text', text: 'a' }; h.poll();
    current = { kind: 'text', text: 'b' }; h.poll();
    current = { kind: 'text', text: 'a' }; h.poll();
    expect(h.entries().map((e) => e.text)).toEqual(['a', 'b']);
  });

  it('classifies links', () => {
    current = { kind: 'text', text: ' https://example.com ' };
    expect(h.poll()?.kind).toBe('link');
  });

  it('records file copies', () => {
    current = { kind: 'files', files: ['/x/a.txt', '/x/b.txt'] };
    expect(h.poll()).toMatchObject({ kind: 'files', files: ['/x/a.txt', '/x/b.txt'], preview: 'a.txt, b.txt' });
  });

  it('records images by signature', () => {
    current = { kind: 'image', imagePath: '/tmp/i.png', signature: 'abc' };
    expect(h.poll()?.kind).toBe('image');
    current = { kind: 'image', imagePath: '/tmp/i2.png', signature: 'abc' };
    expect(h.poll()).toBeNull();
  });

  it('drops oldest unpinned entries above limit, never pinned ones', () => {
    for (const t of ['1', '2']) { current = { kind: 'text', text: t }; h.poll(); }
    h.setPinned(h.entries()[1].id, true);
    for (const t of ['3', '4', '5']) { current = { kind: 'text', text: t }; h.poll(); }
    expect(h.entries().map((e) => e.text)).toEqual(['5', '4', '3', '1']);
  });

  it('clear keeps pinned unless asked', () => {
    current = { kind: 'text', text: 'a' }; h.poll();
    current = { kind: 'text', text: 'b' }; h.poll();
    h.setPinned(h.entries()[0].id, true);
    h.clear();
    expect(h.entries().map((e) => e.text)).toEqual(['b']);
    h.clear({ includePinned: true });
    expect(h.entries()).toEqual([]);
  });

  it('remove deletes one entry and persists', () => {
    current = { kind: 'text', text: 'a' }; h.poll();
    h.remove(h.entries()[0].id);
    expect(h.entries()).toEqual([]);
    expect(saved).toEqual({ entries: [] });
  });

  it('does not re-record content that was present when started', () => {
    current = { kind: 'text', text: 'old' };
    const fresh = make();
    fresh.prime();
    expect(fresh.poll()).toBeNull();
  });
});
