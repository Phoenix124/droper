export type TriggerMode = 'dragStart' | 'edge' | 'atMouse' | 'never';

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface DragDetectorOptions {
  mode: TriggerMode;
  /** Pixels the pointer must travel with the button held before it counts as a drag. */
  threshold?: number;
  /** Width of the screen-edge hot zone for `edge` mode. */
  edgeSize?: number;
  displayAt: (p: Point) => Rect;
  /** `start` is where the button went down, i.e. where the dragged thing came from. */
  onShow: (p: Point, start: Point) => void;
  onDragEnd?: (p: Point, wasDragging: boolean) => void;
  /** Drags starting inside this rect (the shelf itself) are ignored. */
  ignoreRect?: () => Rect | null;
  /** Extra check that something is really being dragged (e.g. the macOS drag pasteboard changed). */
  isRealDrag?: () => boolean;
}

export function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

/**
 * Turns raw global mouse events into "a drag is happening, show the shelf" signals.
 * Pure state machine so it can be fed by any input hook.
 */
export class DragDetector {
  private mode: TriggerMode;
  private readonly threshold: number;
  private readonly edgeSize: number;
  private start: Point | null = null;
  private dragging = false;
  private shown = false;

  constructor(private readonly opts: DragDetectorOptions) {
    this.mode = opts.mode;
    this.threshold = opts.threshold ?? 8;
    this.edgeSize = opts.edgeSize ?? 3;
  }

  setMode(mode: TriggerMode): void {
    this.mode = mode;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  mouseDown(p: Point): void {
    const ignore = this.opts.ignoreRect?.();
    this.start = ignore && contains(ignore, p) ? null : { ...p };
    this.dragging = false;
    this.shown = false;
  }

  mouseMove(p: Point): void {
    if (!this.start) return;
    if (!this.dragging) {
      if (Math.hypot(p.x - this.start.x, p.y - this.start.y) < this.threshold) return;
      this.dragging = true;
    }
    if (this.shown || this.mode === 'never') return;
    if (this.mode === 'edge' && !this.atEdge(p)) return;
    if (this.opts.isRealDrag && !this.opts.isRealDrag()) return;
    this.shown = true;
    this.opts.onShow({ ...p }, { ...this.start });
  }

  mouseUp(p: Point): void {
    if (!this.start) return;
    const wasDragging = this.dragging;
    this.start = null;
    this.dragging = false;
    this.shown = false;
    this.opts.onDragEnd?.({ ...p }, wasDragging);
  }

  private atEdge(p: Point): boolean {
    const d = this.opts.displayAt(p);
    return p.x <= d.x + this.edgeSize || p.x >= d.x + d.width - this.edgeSize;
  }
}
