import { app, BrowserWindow, clipboard, ClipboardItem, nativeImage, shell, type NativeImage } from 'electron';
import { spawn } from 'node:child_process';
import { extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.ico']);
const PREVIEWABLE_EXTS = new Set([...IMAGE_EXTS, '.pdf', '.txt', '.md', '.json', '.svg', '.mp4', '.webm', '.mp3', '.wav']);

const thumbCache = new Map<string, NativeImage>();

/** Thumbnail for images (and on macOS for most documents via Quick Look), file icon otherwise. */
export async function thumbnailFor(path: string): Promise<NativeImage | null> {
  const cached = thumbCache.get(path);
  if (cached) return cached;
  let img: NativeImage | null = null;
  try {
    img = await nativeImage.createThumbnailFromPath(path, { width: 128, height: 128 });
  } catch {
    // Not supported for this file type or platform; fall back to the icon.
  }
  if (!img || img.isEmpty()) {
    try {
      img = await app.getFileIcon(path, { size: process.platform === 'win32' ? 'large' : 'normal' });
    } catch {
      img = null;
    }
  }
  if (img && !img.isEmpty()) thumbCache.set(path, img);
  return img;
}

export function forgetThumbnail(path: string): void {
  thumbCache.delete(path);
}

/** Synchronous icon for startDrag, which needs one immediately. */
export function dragIconFor(paths: string[]): NativeImage {
  const thumb = thumbCache.get(paths[0]);
  if (thumb) return thumb.resize({ width: 64, height: 64 });
  return placeholderIcon();
}

let placeholder: NativeImage | null = null;
function placeholderIcon(): NativeImage {
  if (placeholder) return placeholder;
  const size = 48;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = x > 6 && x < size - 6 && y > 2 && y < size - 2;
      const i = (y * size + x) * 4;
      // BGRA
      buf[i] = 230; buf[i + 1] = 230; buf[i + 2] = 230; buf[i + 3] = inside ? 230 : 0;
    }
  }
  placeholder = nativeImage.createFromBitmap(buf, { width: size, height: size });
  return placeholder;
}

let previewWindow: BrowserWindow | null = null;

export function quickLook(paths: string[]): void {
  if (!paths.length) return;
  if (process.platform === 'darwin') {
    spawn('qlmanage', ['-p', ...paths], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  const path = paths[0];
  if (!PREVIEWABLE_EXTS.has(extname(path).toLowerCase())) {
    void shell.openPath(path);
    return;
  }
  if (!previewWindow || previewWindow.isDestroyed()) {
    previewWindow = new BrowserWindow({
      width: 800,
      height: 600,
      title: 'Preview',
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
    });
  }
  void previewWindow.loadURL(pathToFileURL(path).href);
  previewWindow.setTitle(path);
  previewWindow.show();
}

const MAC_FILES = 'electron application/osclipboard;format="NSFilenamesPboardType"';
const WIN_FILE = 'electron application/osclipboard;format="FileNameW"';

function plistUnescape(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** Puts real files on the clipboard on macOS; paths as text elsewhere. */
export async function copyFiles(paths: string[]): Promise<void> {
  if (process.platform === 'darwin') {
    const plist =
      '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
      '"http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><array>' +
      paths.map((p) => `<string>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</string>`).join('') +
      '</array></plist>';
    await clipboard.write([new ClipboardItem({ [MAC_FILES]: plist, 'text/plain': paths.join('\n') })]);
    return;
  }
  await clipboard.writeText(paths.join('\r\n'));
}

export type ClipboardSnapshot =
  | { kind: 'files'; files: string[] }
  | { kind: 'image'; png: Buffer }
  | { kind: 'text'; text: string };

/** Reads the most useful representation currently on the system clipboard. */
export async function readClipboard(): Promise<ClipboardSnapshot | null> {
  let items: Electron.ClipboardItem[];
  try {
    items = await clipboard.read();
  } catch {
    return null;
  }
  const item = items[0];
  if (!item) return null;
  const text = async (type: string) => {
    const v = await item.getType(type);
    return v instanceof Blob ? v.text() : '';
  };
  try {
    if (item.types.includes(MAC_FILES)) {
      const files = [...(await text(MAC_FILES)).matchAll(/<string>([^<]*)<\/string>/g)].map((m) => plistUnescape(m[1]));
      if (files.length) return { kind: 'files', files };
    }
    if (item.types.includes(WIN_FILE)) {
      const blob = await item.getType(WIN_FILE);
      const path = blob instanceof Blob ? Buffer.from(await blob.arrayBuffer()).toString('ucs2').replace(/\0+$/, '') : '';
      if (path) return { kind: 'files', files: [path] };
    }
    if (item.types.includes('text/uri-list')) {
      const files = (await text('text/uri-list'))
        .split(/\r?\n/)
        .filter((l) => l.startsWith('file://'))
        .map((l) => fileURLToPath(l.trim()));
      if (files.length) return { kind: 'files', files };
    }
    if (item.types.includes('image/png')) {
      const blob = await item.getType('image/png');
      if (blob instanceof Blob) return { kind: 'image', png: Buffer.from(await blob.arrayBuffer()) };
    }
    if (item.types.includes('text/plain')) return { kind: 'text', text: await text('text/plain') };
  } catch {
    return null;
  }
  return null;
}

export async function writeClipboardText(text: string): Promise<void> {
  await clipboard.writeText(text);
}

export async function writeClipboardImage(path: string): Promise<void> {
  const png = nativeImage.createFromPath(path).toPNG();
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTS.has(extname(path).toLowerCase());
}
