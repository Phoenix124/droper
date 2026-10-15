import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, normalizeSettings, SettingsStore } from '../src/core/settings';
import { JsonFile } from '../src/core/jsonFile';

describe('normalizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and rejects invalid ones', () => {
    const s = normalizeSettings({ trigger: 'edge', side: 'up', removeAfterDragOut: false, clipboardLimit: -3, hotkey: 42 });
    expect(s.trigger).toBe('edge');
    expect(s.side).toBe(DEFAULT_SETTINGS.side);
    expect(s.removeAfterDragOut).toBe(false);
    expect(s.clipboardLimit).toBe(DEFAULT_SETTINGS.clipboardLimit);
    expect(s.hotkey).toBe(DEFAULT_SETTINGS.hotkey);
  });
});

describe('SettingsStore', () => {
  it('persists updates and notifies with changed keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'droper-'));
    const file = new JsonFile(join(dir, 'settings.json'));
    const store = new SettingsStore(file);
    const seen: string[][] = [];
    store.onChange((keys) => seen.push(keys));
    store.update({ side: 'left', trigger: DEFAULT_SETTINGS.trigger });
    expect(new SettingsStore(file).get().side).toBe('left');
    expect(seen).toEqual([['side']]);
  });
});

describe('JsonFile', () => {
  it('returns null for missing or corrupt files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'droper-'));
    expect(new JsonFile(join(dir, 'none.json')).read()).toBeNull();
    writeFileSync(join(dir, 'bad.json'), '{oops');
    expect(new JsonFile(join(dir, 'bad.json')).read()).toBeNull();
  });

  it('round-trips data and creates directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'droper-'));
    const f = new JsonFile(join(dir, 'nested', 'x.json'));
    f.write({ a: 1 });
    expect(f.read()).toEqual({ a: 1 });
  });
});

describe('appearance and ignore list settings', () => {
  it('clamps shelf size and validates icon size', () => {
    const s = normalizeSettings({ shelfWidth: 9999, shelfHeight: 10, iconSize: 'huge' });
    expect(s.shelfWidth).toBe(260);
    expect(s.shelfHeight).toBe(280);
    expect(s.iconSize).toBe(DEFAULT_SETTINGS.iconSize);
    expect(normalizeSettings({ shelfWidth: 180.6, iconSize: 'large' })).toMatchObject({ shelfWidth: 181, iconSize: 'large' });
  });

  it('cleans the ignore list', () => {
    const s = normalizeSettings({ ignoredApps: [' com.apple.Finder ', '', 'com.apple.finder', 42, 'x'.repeat(300), 'explorer.exe'] });
    expect(s.ignoredApps).toEqual(['com.apple.Finder', 'explorer.exe']);
  });

  it('does not report an unchanged ignore list as changed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'droper-'));
    const store = new SettingsStore(new JsonFile(join(dir, 's.json')));
    store.update({ ignoredApps: ['a'] });
    const seen: string[][] = [];
    store.onChange((k) => seen.push(k));
    store.update({ ignoredApps: ['a'] });
    expect(seen).toEqual([]);
  });
});

