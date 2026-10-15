import { dirname, join } from 'node:path';

/** Characters that are illegal (or troublesome) in file names on macOS or Windows. */
export const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]+/g;

const WEB_LINK = /^https?:\/\/\S+$/i;

export function isWebLink(text: string): boolean {
  return WEB_LINK.test(text.trim());
}

/**
 * Path for renaming `from` to `rawName` in the same folder, or null when the name is invalid or taken.
 * A case-only change is allowed even though `exists` reports the target on case-insensitive volumes.
 */
export function renameTarget(from: string, rawName: string, exists: (path: string) => boolean): string | null {
  const name = rawName.trim();
  if (!name || name === '.' || name === '..') return null;
  ILLEGAL_FILENAME_CHARS.lastIndex = 0;
  if (ILLEGAL_FILENAME_CHARS.test(name)) return null;
  const to = join(dirname(from), name);
  if (to === from) return to;
  const caseOnly = to.toLowerCase() === from.toLowerCase();
  return !caseOnly && exists(to) ? null : to;
}
