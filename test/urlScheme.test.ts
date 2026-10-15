import { describe, it, expect } from 'vitest';
import { needsConfirmation, parseDroperUrl } from '../src/core/urlScheme';

describe('parseDroperUrl', () => {
  it('parses simple actions', () => {
    for (const a of ['show', 'hide', 'toggle', 'clear', 'restore'] as const) {
      expect(parseDroperUrl(`droper://${a}`)).toEqual({ type: a });
    }
    expect(parseDroperUrl('DROPER://Show/')).toEqual({ type: 'show' });
  });

  it('collects every path for add, keeping only absolute ones', () => {
    expect(parseDroperUrl('droper://add?path=%2Ftmp%2Fa%20b.txt&path=/etc/hosts&path=relative.txt')).toEqual({
      type: 'add',
      paths: ['/tmp/a b.txt', '/etc/hosts'],
    });
  });

  it('accepts Windows drive paths', () => {
    expect(parseDroperUrl('droper://add?path=C%3A%5CUsers%5Cme%5Ca.txt')).toEqual({ type: 'add', paths: ['C:\\Users\\me\\a.txt'] });
  });

  it('parses text and url snippets', () => {
    expect(parseDroperUrl('droper://add-text?text=hello%20world')).toEqual({ type: 'addText', text: 'hello world' });
    expect(parseDroperUrl('droper://add-url?url=https%3A%2F%2Fexample.com&title=Ex')).toEqual({ type: 'addUrl', url: 'https://example.com', title: 'Ex' });
  });

  it('rejects other schemes, unknown actions and empty payloads', () => {
    expect(parseDroperUrl('https://show')).toBeNull();
    expect(parseDroperUrl('droper://format-disk')).toBeNull();
    expect(parseDroperUrl('droper://add')).toBeNull();
    expect(parseDroperUrl('droper://add-text?text=')).toBeNull();
    expect(parseDroperUrl('not a url')).toBeNull();
  });

  it('caps oversized text', () => {
    expect(parseDroperUrl(`droper://add-text?text=${'a'.repeat(200_001)}`)).toBeNull();
  });

  it('marks which actions need the user to confirm', () => {
    expect(needsConfirmation({ type: 'add', paths: ['/a'] })).toBe(true);
    expect(needsConfirmation({ type: 'clear' })).toBe(true);
    for (const a of [{ type: 'show' }, { type: 'restore' }, { type: 'addText', text: 'x' }] as const) {
      expect(needsConfirmation(a)).toBe(false);
    }
  });

  it('rejects UNC and device paths so a link cannot make Windows contact a remote SMB server', () => {
    for (const p of ['\\\\evil\\share\\x.txt', '//evil/share/x.txt', '\\\\?\\C:\\x', '\\\\.\\pipe\\x']) {
      expect(parseDroperUrl(`droper://add?path=${encodeURIComponent(p)}`)).toBeNull();
    }
    expect(parseDroperUrl(`droper://add?path=${encodeURIComponent('//evil/s')}&path=/ok`)).toEqual({ type: 'add', paths: ['/ok'] });
  });
});

