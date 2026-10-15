import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import type { Point } from '../core/dragDetector.js';
import { placeAt, relativeTo } from '../core/shelfPlacement.js';
import type { ShelfSide } from '../core/settings.js';

const MARGIN = 10;

export interface ShelfPlacementStore {
  /** Where the user last put the shelf on this display, relative to its work area. */
  remembered(displayId: number): Point | null;
  moved(displayId: number, rel: Point): void;
}

/** The floating, non-activating shelf panel that sits on top of every space and fullscreen app. */
export class ShelfWindow {
  readonly win: BrowserWindow;
  private width = 132;
  private height = 460;
  /** Bounds we set ourselves, to tell our own moves from the user's. */
  private placed: Rectangle | null = null;

  constructor(private readonly placement: ShelfPlacementStore) {
    const mac = process.platform === 'darwin';
    this.win = new BrowserWindow({
      width: this.width,
      height: this.height,
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
    // On macOS 'moved' is an alias of 'move' and also fires for setBounds, hence the comparison.
    this.win.on('moved', () => {
      const b = this.win.getBounds();
      if (this.placed && b.x === this.placed.x && b.y === this.placed.y) return;
      const display = screen.getDisplayMatching(b);
      this.placement.moved(display.id, relativeTo(b, display.workArea));
    });
  }

  get visible(): boolean {
    return this.win.isVisible();
  }

  bounds(): Rectangle | null {
    return this.win.isVisible() ? this.win.getBounds() : null;
  }

  /** Resizes in place, keeping the shelf on screen. */
  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.win.isVisible()) return;
    const b = this.win.getBounds();
    const area = screen.getDisplayMatching(b).workArea;
    const x = Math.min(Math.max(b.x + b.width - width, area.x), area.x + area.width - width);
    const y = Math.min(Math.max(b.y + Math.round((b.height - height) / 2), area.y), area.y + area.height - height);
    this.place({ x, y, width, height });
  }

  /**
   * Shows the shelf without stealing focus from the drag source: under the cursor, where the user
   * last put it on this display, or at the screen edge.
   */
  showAt(side: ShelfSide, cursor: Point, underCursor = false): void {
    const display = screen.getDisplayNearestPoint(cursor);
    const area = display.workArea;
    const size = { width: this.width, height: this.height };
    const rel = underCursor ? null : this.placement.remembered(display.id);
    let x: number;
    let y: number;
    if (rel) {
      ({ x, y } = placeAt(area, rel, size));
    } else if (underCursor) {
      x = cursor.x - this.width / 2;
      y = cursor.y - 60;
    } else {
      x = side === 'right' ? area.x + area.width - this.width - MARGIN : area.x + MARGIN;
      y = area.y + Math.round((area.height - this.height) / 2);
    }
    x = Math.min(Math.max(x, area.x), area.x + area.width - this.width);
    y = Math.min(Math.max(y, area.y), area.y + area.height - this.height);
    this.place({ x: Math.round(x), y: Math.round(y), width: this.width, height: this.height });
    if (!this.win.isVisible()) this.win.showInactive();
    this.win.moveTop();
  }

  private place(b: Rectangle): void {
    this.placed = b;
    this.win.setBounds(b);
  }

  hide(): void {
    if (this.win.isVisible()) this.win.hide();
  }

  send(channel: string, ...args: unknown[]): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, ...args);
  }
}
