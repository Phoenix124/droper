import { screen, type Rectangle } from 'electron';
import { uIOhook, type UiohookMouseEvent } from 'uiohook-napi';
import { DragDetector, type Point, type TriggerMode } from '../core/dragDetector.js';
import type { MacPasteboardWatcher } from './macPasteboard.js';

const LEFT_BUTTON = 1;

export interface DragWatcherHooks {
  mode: TriggerMode;
  shelfBounds: () => Rectangle | null;
  onShow: (p: Point) => void;
  onDragEnd: (p: Point, wasDragging: boolean) => void;
  /** Every left-button release, including drags that started on the shelf. */
  onMouseUp: (p: Point) => void;
}

/** Feeds global mouse events from uiohook into the DragDetector. */
export class DragWatcher {
  private readonly detector: DragDetector;
  private dragCountAtDown = -1;
  private started = false;

  constructor(private readonly hooks: DragWatcherHooks, private readonly pasteboard: MacPasteboardWatcher | null) {
    this.detector = new DragDetector({
      mode: hooks.mode,
      threshold: 8,
      edgeSize: 3,
      displayAt: (p) => screen.getDisplayNearestPoint(p).bounds,
      onShow: hooks.onShow,
      onDragEnd: hooks.onDragEnd,
      ignoreRect: hooks.shelfBounds,
      // On macOS only treat it as a drag when some app actually started a drag session.
      isRealDrag: pasteboard ? () => pasteboard.dragCount !== this.dragCountAtDown : undefined,
    });
  }

  get isDragging(): boolean {
    return this.detector.isDragging;
  }

  setMode(mode: TriggerMode): void {
    this.detector.setMode(mode);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    uIOhook.on('mousedown', (e) => {
      if (e.button !== LEFT_BUTTON) return;
      this.dragCountAtDown = this.pasteboard?.dragCount ?? -1;
      this.detector.mouseDown(toDip(e));
    });
    uIOhook.on('mousemove', (e) => this.detector.mouseMove(toDip(e)));
    uIOhook.on('mouseup', (e) => {
      if (e.button !== LEFT_BUTTON) return;
      const p = toDip(e);
      this.detector.mouseUp(p);
      this.hooks.onMouseUp(p);
    });
    uIOhook.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    uIOhook.removeAllListeners();
    uIOhook.stop();
  }
}

/** uiohook reports physical pixels on Windows; Electron works in DIPs. */
function toDip(e: UiohookMouseEvent): Point {
  const p = { x: e.x, y: e.y };
  return process.platform === 'win32' ? screen.screenToDipPoint(p) : p;
}
