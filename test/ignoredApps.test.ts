import { describe, it, expect } from 'vitest';
import { isIgnoredApp } from '../src/core/ignoredApps';

const finder = { id: 'com.apple.finder', name: 'Finder', exe: '' };
const explorer = { id: '', name: 'File Explorer', exe: 'explorer.exe' };

describe('isIgnoredApp', () => {
  it('matches bundle id, name or exe name case-insensitively', () => {
    expect(isIgnoredApp(finder, ['COM.APPLE.FINDER'])).toBe(true);
    expect(isIgnoredApp(finder, ['finder'])).toBe(true);
    expect(isIgnoredApp(explorer, ['Explorer.EXE'])).toBe(true);
  });

  it('does not match partial names or empty entries', () => {
    expect(isIgnoredApp(finder, ['find', ''])).toBe(false);
    expect(isIgnoredApp(explorer, ['explorer'])).toBe(false);
  });

  it('ignores nothing for an unknown app', () => {
    expect(isIgnoredApp(null, ['finder'])).toBe(false);
  });
});
