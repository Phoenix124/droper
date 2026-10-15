import { describe, it, expect } from 'vitest';
import { compareVersions, isCheckDue, parseLatestRelease } from '../src/core/updates';

describe('compareVersions', () => {
  it('compares numerically, ignoring a leading v', () => {
    expect(compareVersions('0.3.10', '0.3.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.3.5', 'v0.3.5')).toBe(0);
    expect(compareVersions('0.3', '0.3.1')).toBeLessThan(0);
  });

  it('ranks a pre-release below its release', () => {
    expect(compareVersions('0.4.0-beta.1', '0.4.0')).toBeLessThan(0);
    expect(compareVersions('0.4.0-beta.1', '0.3.9')).toBeGreaterThan(0);
  });

  it('treats unparsable versions as not newer', () => {
    expect(compareVersions('latest', '0.3.5')).toBeLessThan(0);
  });
});

describe('parseLatestRelease', () => {
  const base = 'https://github.com/Phoenix124/droper/releases/';

  it('returns the version and release page', () => {
    expect(parseLatestRelease({ tag_name: 'v0.3.6', html_url: `${base}tag/v0.3.6` })).toEqual({ version: '0.3.6', url: `${base}tag/v0.3.6` });
  });

  it('rejects drafts, pre-releases, malformed data and pages outside this repository', () => {
    expect(parseLatestRelease({ tag_name: 'v0.3.6', html_url: `${base}tag/v0.3.6`, draft: true })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v0.4.0-beta', html_url: `${base}tag/v0.4.0-beta`, prerelease: true })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'nightly', html_url: `${base}tag/nightly` })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v0.3.6', html_url: 'https://evil.example/droper' })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v0.3.6', html_url: 'https://github.com/Phoenix124/droper-fake/releases/x' })).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
  });
});

describe('isCheckDue', () => {
  const day = 24 * 60 * 60 * 1000;
  it('is due once a day, and when the last check is unknown or in the future', () => {
    expect(isCheckDue(null, 1000, day)).toBe(true);
    expect(isCheckDue(0, day - 1, day)).toBe(false);
    expect(isCheckDue(0, day, day)).toBe(true);
    expect(isCheckDue(5 * day, day, day)).toBe(true);
  });
});
