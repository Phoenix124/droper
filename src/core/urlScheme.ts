export type UrlAction =
  | { type: 'show' | 'hide' | 'toggle' | 'clear' | 'restore' }
  | { type: 'add'; paths: string[] }
  | { type: 'addText'; text: string }
  | { type: 'addUrl'; url: string; title?: string };

const SIMPLE = new Set(['show', 'hide', 'toggle', 'clear', 'restore']);
const MAX_TEXT = 200_000;
// Local absolute paths only: POSIX `/x` or a Windows drive `C:\x`. UNC (`\\host\share`, `//host/share`)
// and device paths are refused, because merely checking them makes Windows contact a remote
// SMB server and send the user's NTLM credentials.
const LOCAL_ABSOLUTE = /^(\/(?![\\/])|[a-zA-Z]:[\\/])/;
// macOS automount points: resolving them can make the machine contact a remote host.
const AUTOMOUNT = /^\/(net|network)(\/|$)/i;
// A title ending in ".pdf" etc. would make the saved shortcut look like a document (Explorer hides .url).
const FILE_LIKE_TITLE = /\.[a-z0-9]{1,5}$/i;
// Control and bidi-override characters could disguise a path (or fake extra text) in the confirmation dialog.
const DECEPTIVE = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
/** Every path of a link is listed in the confirmation dialog, so keep that list readable. */
export const MAX_URL_PATHS = 20;

/** False for paths that could be rendered misleadingly (control or bidi characters). */
export function isDisplaySafePath(path: string): boolean {
  return !DECEPTIVE.test(path);
}

/**
 * Parses droper:// links, e.g. droper://add?path=/a&path=/b or droper://add-text?text=hi.
 * Anything unexpected yields null so callers simply ignore it.
 */
export function parseDroperUrl(raw: string): UrlAction | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol.toLowerCase() !== 'droper:') return null;
  const action = (url.hostname || url.pathname.replace(/^\/+/, '')).replace(/\/+$/, '').toLowerCase();
  const q = url.searchParams;

  if (SIMPLE.has(action)) return { type: action as 'show' };
  if (action === 'add') {
    const raw = q.getAll('path');
    // Refuse the whole link rather than silently dropping suspicious entries.
    if (raw.length > MAX_URL_PATHS || !raw.every(isDisplaySafePath)) return null;
    if (raw.some((p) => AUTOMOUNT.test(p))) return null;
    const paths = raw.filter((p) => LOCAL_ABSOLUTE.test(p));
    return paths.length ? { type: 'add', paths } : null;
  }
  if (action === 'add-text') {
    const text = q.get('text') ?? '';
    return text.trim() && text.length <= MAX_TEXT ? { type: 'addText', text } : null;
  }
  if (action === 'add-url') {
    const target = q.get('url') ?? '';
    if (!target) return null;
    const rawTitle = q.get('title') ?? '';
    const title = rawTitle && !FILE_LIKE_TITLE.test(rawTitle.trim()) ? rawTitle : undefined;
    return { type: 'addUrl', url: target, ...(title ? { title } : {}) };
  }
  return null;
}

/** Actions a web page could abuse (pull arbitrary local files onto the shelf, wipe it) need the user's OK. */
export function needsConfirmation(action: UrlAction): boolean {
  return action.type === 'add' || action.type === 'clear';
}
