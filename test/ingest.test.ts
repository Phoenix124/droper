import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { saveSnippet, snippetTitle } from '../src/core/ingest';

describe('snippetTitle', () => {
  it('uses the first line, trimmed and shortened', () => {
    expect(snippetTitle('  Hello world  \nsecond line')).toBe('Hello world');
    expect(snippetTitle('a'.repeat(80))).toBe('a'.repeat(40));
  });

  it('strips characters that are illegal in file names', () => {
    expect(snippetTitle('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
  });

  it('falls back to Text for blank input', () => {
    expect(snippetTitle('   \n ')).toBe('Text');
  });
});

describe('saveSnippet', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'droper-')); });

  it('saves text as a .txt file', () => {
    const p = saveSnippet(dir, { kind: 'text', text: 'Shopping list\nmilk' }, 'darwin');
    expect(basename(p)).toBe('Shopping list.txt');
    expect(readFileSync(p, 'utf8')).toBe('Shopping list\nmilk');
  });

  it('saves links as .webloc on macOS', () => {
    const p = saveSnippet(dir, { kind: 'url', url: 'https://example.com/a?b=1&c=2', title: 'Example' }, 'darwin');
    expect(basename(p)).toBe('Example.webloc');
    const body = readFileSync(p, 'utf8');
    expect(body).toContain('<key>URL</key>');
    expect(body).toContain('<string>https://example.com/a?b=1&amp;c=2</string>');
  });

  it('saves links as .url on Windows, titled by host when no title', () => {
    const p = saveSnippet(dir, { kind: 'url', url: 'https://example.com/page' }, 'win32');
    expect(basename(p)).toBe('example.com.url');
    expect(readFileSync(p, 'utf8')).toBe('[InternetShortcut]\r\nURL=https://example.com/page\r\n');
  });

  it('saves image bytes with extension from mime type', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const p = saveSnippet(dir, { kind: 'image', data: bytes, mime: 'image/jpeg', fileName: 'photo' }, 'darwin');
    expect(basename(p)).toBe('photo.jpg');
    expect([...readFileSync(p)]).toEqual([1, 2, 3]);
  });

  it('keeps an existing image extension from the file name', () => {
    const p = saveSnippet(dir, { kind: 'image', data: new Uint8Array([0]), mime: 'image/png', fileName: 'shot.png' }, 'darwin');
    expect(basename(p)).toBe('shot.png');
  });

  it('never overwrites existing snippets', () => {
    const a = saveSnippet(dir, { kind: 'text', text: 'same' }, 'darwin');
    const b = saveSnippet(dir, { kind: 'text', text: 'same' }, 'darwin');
    expect(a).not.toBe(b);
    expect(basename(b)).toBe('same 2.txt');
  });

  it('strips line breaks so .url files cannot get injected keys', () => {
    const p = saveSnippet(dir, { kind: 'url', url: 'https://a.com/\r\nIconFile=\\\\evil\\x' }, 'win32');
    const body = readFileSync(p, 'utf8');
    expect(body.split('\r\n').filter(Boolean)).toHaveLength(2);
    expect(body).not.toMatch(/^IconFile=/m);
  });

  it('saves non-web links as plain text instead of shortcuts', () => {
    const p = saveSnippet(dir, { kind: 'url', url: 'javascript:alert(1)' }, 'win32');
    expect(basename(p)).toMatch(/\.txt$/);
    expect(readFileSync(p, 'utf8')).toBe('javascript:alert(1)');
  });

  it('never takes a non-image extension from the dropped file name', () => {
    const p = saveSnippet(dir, { kind: 'image', data: new Uint8Array([0]), mime: 'image/png', fileName: 'run.exe' }, 'win32');
    expect(basename(p)).toBe('run.exe.png');
  });

  it('rejects non-image mime types for image payloads', () => {
    const p = saveSnippet(dir, { kind: 'image', data: new Uint8Array([0]), mime: 'application/x-msdownload', fileName: 'a' }, 'win32');
    expect(basename(p)).toBe('a.png');
  });
});
