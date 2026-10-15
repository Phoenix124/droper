import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type SnippetPayload =
  | { kind: 'text'; text: string }
  | { kind: 'url'; url: string; title?: string }
  | { kind: 'image'; data: Uint8Array; mime: string; fileName?: string };

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]+/g;
const MAX_TITLE = 40;

const SHORTCUT_PROTOCOLS = new Set(['http:', 'https:', 'ftp:', 'mailto:']);

const IMAGE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/tiff': '.tiff',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'image/heic': '.heic',
};

export function snippetTitle(text: string, fallback = 'Text'): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  const clean = line.replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE).trim();
  return clean || fallback;
}

const ALLOWED_IMAGE_EXT = new Set([...Object.values(IMAGE_EXT), '.jpeg', '.tif']);

export function uniquePath(dir: string, stem: string, ext: string): string {
  let candidate = join(dir, `${stem}${ext}`);
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${stem} ${n}${ext}`);
  return candidate;
}

/** Creates the file exclusively ('wx'), bumping the counter on collisions, so nothing is ever overwritten. */
function writeUnique(dir: string, stem: string, ext: string, data: string | Uint8Array): string {
  for (let n = 1; ; n++) {
    const path = join(dir, n === 1 ? `${stem}${ext}` : `${stem} ${n}${ext}`);
    try {
      writeFileSync(path, data, { flag: 'wx' });
      return path;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}

/** Only well-formed web/mail links become shortcut files; the URL is re-serialized so it holds no line breaks. */
function safeShortcutUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return SHORTCUT_PROTOCOLS.has(url.protocol) ? url.href.replace(/[\r\n]/g, '') : null;
  } catch {
    return null;
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function urlTitle(url: string): string {
  try {
    return new URL(url).host || 'Link';
  } catch {
    return 'Link';
  }
}

/** Writes dropped text, links or images into `dir` as real files, returning the new path. */
export function saveSnippet(dir: string, payload: SnippetPayload, platform: NodeJS.Platform = process.platform): string {
  mkdirSync(dir, { recursive: true });
  switch (payload.kind) {
    case 'text':
      return writeUnique(dir, snippetTitle(payload.text), '.txt', payload.text);
    case 'url': {
      const url = safeShortcutUrl(payload.url);
      if (!url) return writeUnique(dir, snippetTitle(payload.url), '.txt', payload.url);
      const stem = snippetTitle(payload.title ?? '', urlTitle(url));
      if (platform === 'darwin') {
        return writeUnique(
          dir,
          stem,
          '.webloc',
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
            `<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>${escapeXml(url)}</string>\n</dict>\n</plist>\n`,
        );
      }
      return writeUnique(dir, stem, '.url', `[InternetShortcut]\r\nURL=${url}\r\n`);
    }
    case 'image': {
      const name = payload.fileName ?? '';
      const nameExt = /\.[a-z0-9]{2,5}$/i.exec(name)?.[0].toLowerCase();
      const keepExt = nameExt !== undefined && ALLOWED_IMAGE_EXT.has(nameExt);
      const ext = keepExt ? nameExt : (IMAGE_EXT[payload.mime] ?? '.png');
      const stem = snippetTitle(keepExt ? name.slice(0, -nameExt.length) : name, 'Image');
      return writeUnique(dir, stem, ext, payload.data);
    }
  }
}
