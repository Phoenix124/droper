export type TriggerMode = 'dragStart' | 'edge' | 'atMouse' | 'shake' | 'never';

// Shake: this many left/right reversals, each after at least MIN_TRAVEL px, within WINDOW ms.
const SHAKE_REVERSALS = 3;
const SHAKE_MIN_TRAVEL = 24;
const SHAKE_WINDOW_MS = 700;

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
  now?: () => number;
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
  private readonly now: () => number;
  private shake = { lastX: 0, dir: 0, travel: 0, reversals: [] as number[] };

  constructor(private readonly opts: DragDetectorOptions) {
    this.mode = opts.mode;
    this.threshold = opts.threshold ?? 8;
    this.edgeSize = opts.edgeSize ?? 3;
    this.now = opts.now ?? Date.now;
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
    this.shake = { lastX: p.x, dir: 0, travel: 0, reversals: [] };
  }

  mouseMove(p: Point): void {
    if (!this.start) return;
    if (!this.dragging) {
      if (Math.hypot(p.x - this.start.x, p.y - this.start.y) < this.threshold) return;
      this.dragging = true;
    }
    const shook = this.trackShake(p);
    if (this.shown || this.mode === 'never') return;
    if (this.mode === 'edge' && !this.atEdge(p)) return;
    if (this.mode === 'shake' && !shook) return;
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

  /** Follows horizontal direction changes; true at the reversal that completes a shake. */
  private trackShake(p: Point): boolean {
    const s = this.shake;
    const dx = p.x - s.lastX;
    s.lastX = p.x;
    if (dx === 0) return false;
    const dir = Math.sign(dx);
    let shook = false;
    if (dir !== s.dir) {
      // Short segments are hand jitter, not a shake.
      if (s.dir !== 0 && s.travel >= SHAKE_MIN_TRAVEL) {
        const now = this.now();
        s.reversals = s.reversals.filter((t) => now - t <= SHAKE_WINDOW_MS);
        s.reversals.push(now);
        shook = s.reversals.length >= SHAKE_REVERSALS;
      }
      s.dir = dir;
      s.travel = 0;
    }
    s.travel += Math.abs(dx);
    return shook;
  }

  private atEdge(p: Point): boolean {
    const d = this.opts.displayAt(p);
    return p.x <= d.x + this.edgeSize || p.x >= d.x + d.width - this.edgeSize;
  }
}
