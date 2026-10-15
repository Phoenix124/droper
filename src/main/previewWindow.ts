import { app, BrowserWindow, nativeImage, screen, type Rectangle } from 'electron';
import { openSync, readSync, closeSync, readdirSync, statSync, type Stats } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { looksBinary, previewBounds, previewKind } from '../core/preview.js';
import type { PreviewEntry, PreviewPayload } from '../shared/api';
import { thumbnailFor } from './platform.js';

const SIZE = { width: 560, height: 620 };
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_STACK_ENTRIES = 12;

export interface PreviewTarget {
  id: string;
  paths: string[];
  name: string;
}

function humanSize(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let u = 0;
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000;
    u++;
  }
  return u === 0 ? `${bytes} bytes` : `${n.toFixed(n < 10 ? 1 : 0)} ${units[u]}`;
}

function kindLabel(path: string, st: Stats): string {
  if (st.isDirectory()) return extname(path) ? extname(path).slice(1).toUpperCase() + ' bundle' : 'Folder';
  return extname(path) ? extname(path).slice(1).toUpperCase() : 'File';
}

function readTextHead(path: string): { text: string; truncated: boolean } | null {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(MAX_TEXT_BYTES + 1);
    const n = readSync(fd, buf, 0, buf.length, 0);
    const bytes = buf.subarray(0, Math.min(n, MAX_TEXT_BYTES));
    if (looksBinary(bytes)) return null;
    return { text: bytes.toString('utf8'), truncated: n > MAX_TEXT_BYTES };
  } finally {
    closeSync(fd);
  }
}

async function bigThumb(path: string): Promise<string | null> {
  try {
    const img = await nativeImage.createThumbnailFromPath(path, { width: 1024, height: 1024 });
    if (!img.isEmpty()) return img.toDataURL();
  } catch {
    // No thumbnail generator for this type; use the icon instead.
  }
  try {
    return (await app.getFileIcon(path, { size: 'large' })).toDataURL();
  } catch {
    return null;
  }
}

async function buildPayload(target: PreviewTarget): Promise<PreviewPayload> {
  if (target.paths.length > 1) {
    const entries: PreviewEntry[] = await Promise.all(
      target.paths.slice(0, MAX_STACK_ENTRIES).map(async (p) => ({ name: basename(p), thumb: (await thumbnailFor(p))?.toDataURL() ?? null })),
    );
    const more = target.paths.length - entries.length;
    return { name: target.name, info: `Stack · ${target.paths.length} items${more > 0 ? ` (${more} not shown)` : ''}`, kind: 'stack', entries };
  }

  const path = target.paths[0];
  let st: Stats;
  try {
    st = statSync(path);
  } catch {
    return { name: basename(path), info: 'File not found', kind: 'other', thumb: null };
  }
  const name = basename(path);
  const modified = st.mtime.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const kind = previewKind(path, st.isDirectory());

  if (kind === 'folder') {
    let count = 0;
    try {
      count = readdirSync(path).filter((n) => !n.startsWith('.')).length;
    } catch {
      // Unreadable folder; show it without a count.
    }
    return { name, info: `${kindLabel(path, st)} · ${count} items · ${modified}`, kind, thumb: await bigThumb(path) };
  }

  const info = `${humanSize(st.size)} · ${kindLabel(path, st)} · ${modified}`;
  if (kind === 'text') {
    const head = readTextHead(path);
    if (head) return { name, info, kind, ...head };
    return { name, info, kind: 'other', thumb: await bigThumb(path) };
  }
  if (kind === 'other') return { name, info, kind, thumb: await bigThumb(path) };
  return { name, info, kind, src: pathToFileURL(path).href };
}

/** Preview popover that sits next to the shelf and never takes keyboard focus. */
export class PreviewWindow {
  private win: BrowserWindow | null = null;
  private current: string | null = null;
  private generation = 0;

  constructor(private readonly onState: (open: boolean) => void) {}

  get window(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  get openId(): string | null {
    return this.win?.isVisible() ? this.current : null;
  }

  async show(target: PreviewTarget, shelf: Rectangle): Promise<void> {
    const mine = ++this.generation;
    this.current = target.id;
    const payload = await buildPayload(target);
    if (mine !== this.generation) return; // a newer item was requested meanwhile
    const win = await this.ensure();
    const work = screen.getDisplayMatching(shelf).workArea;
    win.setBounds(previewBounds(shelf, work, SIZE));
    win.webContents.send('preview:show', payload);
    if (!win.isVisible()) {
      win.showInactive();
      this.onState(true);
    }
    win.moveTop();
  }

  hide(): void {
    this.generation++;
    this.current = null;
    if (this.win?.isVisible()) {
      this.win.hide();
      this.onState(false);
    }
  }

  private async ensure(): Promise<BrowserWindow> {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const mac = process.platform === 'darwin';
    const win = new BrowserWindow({
      ...SIZE,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      ...(mac ? { type: 'panel', vibrancy: 'hud', visualEffectState: 'active' } : { backgroundMaterial: 'acrylic' }),
      webPreferences: {
        preload: join(__dirname, '../preload/previewPreload.js'),
        contextIsolation: true,
        sandbox: true,
        // Needed for Chromium's built-in PDF viewer.
        plugins: true,
      },
    } as Electron.BrowserWindowConstructorOptions);
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.on('closed', () => {
      this.win = null;
    });
    this.win = win;
    await win.loadFile(join(__dirname, '../renderer/preview.html'));
    return win;
  }
}
