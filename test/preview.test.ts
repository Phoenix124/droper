import { describe, it, expect } from 'vitest';
import { looksBinary, previewBounds, previewKind } from '../src/core/preview';

describe('previewKind', () => {
  it('classifies by extension, case-insensitively', () => {
    expect(previewKind('/a/Photo.JPG', false)).toBe('image');
    expect(previewKind('/a/doc.pdf', false)).toBe('pdf');
    expect(previewKind('/a/notes.md', false)).toBe('text');
    expect(previewKind('C:\\a\\main.ts', false)).toBe('text');
    expect(previewKind('/a/clip.mov', false)).toBe('video');
    expect(previewKind('/a/song.mp3', false)).toBe('audio');
    expect(previewKind('/a/report.docx', false)).toBe('other');
  });

  it('treats directories (including bundles like .app) as folders', () => {
    expect(previewKind('/Applications/Safari.app', true)).toBe('folder');
  });

  it('treats extensionless files as text candidates', () => {
    expect(previewKind('/etc/hosts', false)).toBe('text');
  });
});

describe('looksBinary', () => {
  it('detects NUL bytes', () => {
    expect(looksBinary(new Uint8Array([72, 105, 0, 1]))).toBe(true);
    expect(looksBinary(new TextEncoder().encode('plain text\nhere'))).toBe(false);
  });
});

describe('previewBounds', () => {
  const work = { x: 0, y: 25, width: 1500, height: 900 };
  const size = { width: 500, height: 600 };

  it('opens on the screen side of a right-edge shelf, vertically centered', () => {
    const shelf = { x: 1358, y: 250, width: 132, height: 460 };
    expect(previewBounds(shelf, work, size)).toEqual({ x: 1358 - 8 - 500, y: 180, width: 500, height: 600 });
  });

  it('opens to the right of a left-edge shelf', () => {
    const shelf = { x: 10, y: 250, width: 132, height: 460 };
    expect(previewBounds(shelf, work, size).x).toBe(10 + 132 + 8);
  });

  it('stays inside the work area and shrinks when the screen is small', () => {
    const shelf = { x: 1358, y: 25, width: 132, height: 460 };
    const small = { x: 0, y: 25, width: 1500, height: 500 };
    const b = previewBounds(shelf, small, size);
    expect(b.y).toBe(25);
    expect(b.height).toBe(500);
  });
});
