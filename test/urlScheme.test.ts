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

  it('refuses paths with control or bidi characters that could disguise them in the confirmation dialog', () => {
    for (const p of ['/tmp/a\nOnly continue', '/tmp/\u202Etxt.exe', '/tmp/a\u2066b', '/tmp/a\u0007']) {
      expect(parseDroperUrl(`droper://add?path=${encodeURIComponent(p)}`)).toBeNull();
    }
  });

  it('refuses links with more paths than the dialog can show', () => {
    const many = Array.from({ length: 21 }, (_, i) => `path=/tmp/f${i}`).join('&');
    expect(parseDroperUrl(`droper://add?${many}`)).toBeNull();
    const ok = Array.from({ length: 20 }, (_, i) => `path=/tmp/f${i}`).join('&');
    expect(parseDroperUrl(`droper://add?${ok}`)).toMatchObject({ type: 'add' });
  });

  it('refuses macOS automount paths that would contact a remote host before the user agrees', () => {
    for (const p of ['/net/evil/x', '/Network/Servers/evil/x', '/NET/evil/x']) {
      expect(parseDroperUrl(`droper://add?path=${encodeURIComponent(p)}`)).toBeNull();
    }
  });

  it('drops link titles that look like file names, so a link cannot pose as a document', () => {
    expect(parseDroperUrl('droper://add-url?url=https%3A%2F%2Fevil.example&title=Invoice.pdf')).toEqual({ type: 'addUrl', url: 'https://evil.example' });
    expect(parseDroperUrl('droper://add-url?url=https%3A%2F%2Fa.com&title=Docs')).toEqual({ type: 'addUrl', url: 'https://a.com', title: 'Docs' });
  });
});

