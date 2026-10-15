import { describe, it, expect } from 'vitest';
import { archiveName, entryNames } from '../src/core/archive';

describe('archiveName', () => {
  it('names a single item after it, like Finder', () => {
    expect(archiveName(['/a/Report.pdf'])).toBe('Report.pdf.zip');
    expect(archiveName(['C:\\x\\Photos'])).toBe('Photos.zip');
  });

  it('uses Archive.zip for several items', () => {
    expect(archiveName(['/a/one', '/b/two'])).toBe('Archive.zip');
  });
});

describe('entryNames', () => {
  it('keeps base names and numbers duplicates before the extension', () => {
    expect(entryNames(['/a/x.txt', '/b/x.txt', '/c/X.txt', '/d/dir', '/e/dir'])).toEqual(['x.txt', 'x 2.txt', 'X 3.txt', 'dir', 'dir 2']);
  });
});
