import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { isWebLink, renameTarget } from '../src/core/fileNames';

describe('renameTarget', () => {
  const from = join('/dir', 'report.pdf');
  const none = () => false;

  it('builds the new path next to the old one', () => {
    expect(renameTarget(from, '  final.pdf ', none)).toBe(join('/dir', 'final.pdf'));
  });

  it('rejects empty, dot and illegal names', () => {
    for (const name of ['', '  ', '.', '..', 'a/b', 'a\\b', 'a:b', 'a*b']) expect(renameTarget(from, name, none)).toBeNull();
  });

  it('rejects names that already exist', () => {
    expect(renameTarget(from, 'taken.pdf', () => true)).toBeNull();
  });

  it('allows case-only renames on case-insensitive file systems', () => {
    expect(renameTarget(from, 'Report.pdf', () => true)).toBe(join('/dir', 'Report.pdf'));
  });
});

describe('isWebLink', () => {
  it('accepts single http(s) URLs only', () => {
    expect(isWebLink(' https://a.com/x ')).toBe(true);
    expect(isWebLink('http://a.com')).toBe(true);
    expect(isWebLink('see https://a.com')).toBe(false);
    expect(isWebLink('ftp://a.com')).toBe(false);
  });
});
