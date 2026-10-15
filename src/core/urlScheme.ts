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
    const paths = q.getAll('path').filter((p) => LOCAL_ABSOLUTE.test(p));
    return paths.length ? { type: 'add', paths } : null;
  }
  if (action === 'add-text') {
    const text = q.get('text') ?? '';
    return text.trim() && text.length <= MAX_TEXT ? { type: 'addText', text } : null;
  }
  if (action === 'add-url') {
    const target = q.get('url') ?? '';
    if (!target) return null;
    const title = q.get('title') ?? undefined;
    return { type: 'addUrl', url: target, ...(title ? { title } : {}) };
  }
  return null;
}

/** Actions a web page could abuse (pull arbitrary local files onto the shelf, wipe it) need the user's OK. */
export function needsConfirmation(action: UrlAction): boolean {
  return action.type === 'add' || action.type === 'clear';
}
