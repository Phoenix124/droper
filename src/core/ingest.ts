import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type SnippetPayload =
  | { kind: 'text'; text: string }
  | { kind: 'url'; url: string; title?: string }
  | { kind: 'image'; data: Uint8Array; mime: string; fileName?: string };

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]+/g;
const MAX_TITLE = 40;

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

export function uniquePath(dir: string, stem: string, ext: string): string {
  let candidate = join(dir, `${stem}${ext}`);
  for (let n = 2; existsSync(candidate); n++) candidate = join(dir, `${stem} ${n}${ext}`);
  return candidate;
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
    case 'text': {
      const path = uniquePath(dir, snippetTitle(payload.text), '.txt');
      writeFileSync(path, payload.text, 'utf8');
      return path;
    }
    case 'url': {
      const stem = snippetTitle(payload.title ?? '', urlTitle(payload.url));
      if (platform === 'darwin') {
        const path = uniquePath(dir, stem, '.webloc');
        writeFileSync(
          path,
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
            `<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>${escapeXml(payload.url)}</string>\n</dict>\n</plist>\n`,
          'utf8',
        );
        return path;
      }
      const path = uniquePath(dir, stem, '.url');
      writeFileSync(path, `[InternetShortcut]\r\nURL=${payload.url}\r\n`, 'utf8');
      return path;
    }
    case 'image': {
      const name = payload.fileName ?? '';
      const extMatch = /\.[a-z0-9]{2,5}$/i.exec(name);
      const ext = extMatch ? extMatch[0].toLowerCase() : (IMAGE_EXT[payload.mime] ?? '.png');
      const stem = snippetTitle(extMatch ? name.slice(0, -extMatch[0].length) : name, 'Image');
      const path = uniquePath(dir, stem, ext);
      writeFileSync(path, payload.data);
      return path;
    }
  }
}
