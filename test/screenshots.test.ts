import { describe, it, expect } from 'vitest';
import { isScreenshotCandidate, macScreenshotDir, RecentPaths } from '../src/core/screenshots';

describe('macScreenshotDir', () => {
  it('uses the configured location, expanding ~', () => {
    expect(macScreenshotDir('~/Downloads\n', '/Users/me')).toBe('/Users/me/Downloads');
    expect(macScreenshotDir('/Volumes/Shots', '/Users/me')).toBe('/Volumes/Shots');
  });

  it('falls back to the Desktop when nothing usable is configured', () => {
    expect(macScreenshotDir(null, '/Users/me')).toBe('/Users/me/Desktop');
    expect(macScreenshotDir('  ', '/Users/me')).toBe('/Users/me/Desktop');
    expect(macScreenshotDir('relative/dir', '/Users/me')).toBe('/Users/me/Desktop');
  });
});

describe('isScreenshotCandidate', () => {
  it('accepts image and screen recording files', () => {
    for (const n of ['Screenshot 2026-10-15 at 11.19.32.png', 'Снимок экрана.JPG', 'a.heic', 'Screen Recording.mov', 'x.pdf']) {
      expect(isScreenshotCandidate(n)).toBe(true);
    }
  });

  it('skips hidden temp files and other types', () => {
    for (const n of ['.Screenshot 2026-10-15.png', 'notes.txt', 'archive.zip', 'png']) {
      expect(isScreenshotCandidate(n)).toBe(false);
    }
  });
});

describe('RecentPaths', () => {
  it('reports a path once within the window and again after it expires', () => {
    const r = new RecentPaths(1000);
    expect(r.add('/a', 0)).toBe(true);
    expect(r.add('/a', 500)).toBe(false);
    expect(r.add('/b', 500)).toBe(true);
    expect(r.add('/a', 1600)).toBe(true);
  });
});
