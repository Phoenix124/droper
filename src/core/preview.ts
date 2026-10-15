import type { Rect } from './dragDetector.js';

export type PreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'folder' | 'other';

const BY_EXT: Record<string, PreviewKind> = {};
const add = (kind: PreviewKind, exts: string) => exts.split(' ').forEach((e) => (BY_EXT[e] = kind));
add('image', 'png jpg jpeg gif webp bmp svg ico avif apng');
add('pdf', 'pdf');
add('video', 'mp4 m4v mov webm ogv');
add('audio', 'mp3 m4a aac wav ogg oga flac opus');
add(
  'text',
  'txt md markdown log csv tsv json jsonc xml yml yaml toml ini cfg conf env plist html htm css scss less ' +
    'js mjs cjs jsx ts tsx py rb go rs java kt kts swift c h cc cpp hpp cs php sh zsh bash fish ps1 bat cmd sql ' +
    'gradle properties lua r dart vue svelte gitignore editorconfig dockerfile makefile',
);

/** How the preview popover should render a path. */
export function previewKind(path: string, isDirectory: boolean): PreviewKind {
  if (isDirectory) return 'folder';
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'text'; // extensionless (hosts, Makefile, LICENSE…); binary content is caught later
  return BY_EXT[name.slice(dot + 1).toLowerCase()] ?? 'other';
}

/** Heuristic: a NUL byte in the first 8 KB means it isn't text. */
export function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8192);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

/**
 * Places the preview next to the shelf, on the side facing the middle of the screen,
 * vertically centered on the shelf and clamped (and shrunk if needed) into the work area.
 */
export function previewBounds(shelf: Rect, work: Rect, size: { width: number; height: number }, gap = 8): Rect {
  const width = Math.min(size.width, work.width);
  const height = Math.min(size.height, work.height);
  const shelfCenter = shelf.x + shelf.width / 2;
  const workCenter = work.x + work.width / 2;
  let x = shelfCenter >= workCenter ? shelf.x - gap - width : shelf.x + shelf.width + gap;
  x = Math.min(Math.max(x, work.x), work.x + work.width - width);
  let y = Math.round(shelf.y + shelf.height / 2 - height / 2);
  y = Math.min(Math.max(y, work.y), work.y + work.height - height);
  return { x: Math.round(x), y, width, height };
}
