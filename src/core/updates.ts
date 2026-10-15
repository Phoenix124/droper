export const RELEASES_API = 'https://api.github.com/repos/Phoenix124/droper/releases/latest';
const RELEASE_PAGE_PREFIX = 'https://github.com/Phoenix124/droper/releases/';
const VERSION = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/;

export interface LatestRelease {
  version: string;
  /** Release page on GitHub; the only place we send people to download. */
  url: string;
}

/** Positive when a is newer. A pre-release ranks below its release; anything unparsable is oldest. */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION.exec(a.trim());
  const pb = VERSION.exec(b.trim());
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  const na = pa[1].split('.').map(Number);
  const nb = pb[1].split('.').map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0);
    if (d !== 0) return d;
  }
  if (pa[2] && !pb[2]) return -1;
  if (!pa[2] && pb[2]) return 1;
  return (pa[2] ?? '').localeCompare(pb[2] ?? '', undefined, { numeric: true });
}

/** Reads GitHub's releases/latest response; null for anything we wouldn't offer as an update. */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  if (r.draft === true || r.prerelease === true) return null;
  if (typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') return null;
  const m = VERSION.exec(r.tag_name.trim());
  if (!m || !r.html_url.startsWith(RELEASE_PAGE_PREFIX)) return null;
  return { version: r.tag_name.trim().replace(/^v/, ''), url: r.html_url };
}

/** A clock that went backwards (last check in the future) also makes a check due. */
export function isCheckDue(lastCheck: number | null, now: number, intervalMs: number): boolean {
  return lastCheck === null || now - lastCheck >= intervalMs || lastCheck > now;
}
