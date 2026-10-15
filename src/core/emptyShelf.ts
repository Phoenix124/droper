export interface EmptyShelfState {
  visible: boolean;
  empty: boolean;
  autoHide: boolean;
  dragging: boolean;
  /** Pointer is over the shelf. */
  hovered: boolean;
}

/**
 * Decides when an empty shelf should go away. Covers shelves shown by hand (launch, hotkey, tray),
 * which the drag-end auto-hide never sees: once the shelf has sat empty and untouched for `delayMs`.
 */
export class EmptyShelfIdle {
  private since: number | null = null;

  constructor(private readonly delayMs: number) {}

  /** Call periodically; true means hide now. */
  tick(s: EmptyShelfState, now: number): boolean {
    const idle = s.visible && s.empty && s.autoHide && !s.dragging && !s.hovered;
    if (!idle) {
      this.since = null;
      return false;
    }
    this.since ??= now;
    if (now - this.since < this.delayMs) return false;
    this.since = null;
    return true;
  }
}
