import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import type { Point } from '../core/dragDetector.js';
import type { ShelfSide } from '../core/settings.js';

const WIDTH = 132;
const HEIGHT = 460;
const MARGIN = 10;

/** The floating, non-activating shelf panel that sits on top of every space and fullscreen app. */
export class ShelfWindow {
  readonly win: BrowserWindow;

  constructor() {
    const mac = process.platform === 'darwin';
    this.win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      ...(mac ? { type: 'panel', vibrancy: 'hud', visualEffectState: 'active' } : { backgroundMaterial: 'acrylic' }),
      webPreferences: {
        preload: join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    } as Electron.BrowserWindowConstructorOptions);
    this.win.setAlwaysOnTop(true, 'floating');
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    void this.win.loadFile(join(__dirname, '../renderer/shelf.html'));
  }

  get visible(): boolean {
    return this.win.isVisible();
  }

  bounds(): Rectangle | null {
    return this.win.isVisible() ? this.win.getBounds() : null;
  }

  /** Shows the shelf at the screen edge (or under the cursor) without stealing focus from the drag source. */
  showAt(side: ShelfSide, cursor: Point, underCursor = false): void {
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    let x: number;
    let y: number;
    if (underCursor) {
      x = cursor.x - WIDTH / 2;
      y = cursor.y - 60;
    } else {
      x = side === 'right' ? area.x + area.width - WIDTH - MARGIN : area.x + MARGIN;
      y = area.y + Math.round((area.height - HEIGHT) / 2);
    }
    x = Math.min(Math.max(x, area.x), area.x + area.width - WIDTH);
    y = Math.min(Math.max(y, area.y), area.y + area.height - HEIGHT);
    this.win.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: HEIGHT });
    if (!this.win.isVisible()) this.win.showInactive();
    this.win.moveTop();
  }

  hide(): void {
    if (this.win.isVisible()) this.win.hide();
  }

  send(channel: string, ...args: unknown[]): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, ...args);
  }
}
