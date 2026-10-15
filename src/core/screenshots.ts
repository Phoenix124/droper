import { extname, isAbsolute, join } from 'node:path';

// What macOS screencapture, Windows Snipping Tool and screen recorders save.
const SCREENSHOT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.heic', '.tif', '.tiff', '.gif', '.pdf', '.mov', '.mp4']);

/**
 * Screenshot folder from `defaults read com.apple.screencapture location` output (null when unset).
 * macOS falls back to the Desktop for a missing or unusable location, and so do we.
 */
export function macScreenshotDir(location: string | null, home: string): string {
  const raw = location?.trim() ?? '';
  const dir = raw === '~' ? home : raw.startsWith('~/') ? join(home, raw.slice(2)) : raw;
  return dir && isAbsolute(dir) ? dir : join(home, 'Desktop');
}

/** Names worth checking; screencapture writes a hidden temp file first and renames it when done. */
export function isScreenshotCandidate(name: string): boolean {
  return !name.startsWith('.') && SCREENSHOT_EXTS.has(extname(name).toLowerCase());
}

/** File watchers fire several events per file; this lets each path through once per window. */
export class RecentPaths {
  private seen = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  add(path: string, now: number): boolean {
    for (const [p, at] of this.seen) if (now - at >= this.windowMs) this.seen.delete(p);
    if (this.seen.has(path)) return false;
    this.seen.set(path, now);
    return true;
  }
}
