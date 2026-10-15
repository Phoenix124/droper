import { nativeDrag } from './nativeDrag.js';

const POLL_MS = 40;

/**
 * macOS only. Polls the system drag pasteboard (changes whenever any app starts a real drag
 * session) and the general pasteboard (changes on every copy) through the native addon.
 */
export class MacPasteboardWatcher {
  dragCount = -1;
  generalCount = -1;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly onGeneralChange: () => void) {}

  /** False when the addon isn't built; callers then fall back to plain drag detection and polling. */
  static available(): boolean {
    return typeof nativeDrag()?.pasteboardCounts === 'function';
  }

  start(): void {
    const read = nativeDrag()?.pasteboardCounts;
    if (!read || this.timer) return;
    this.timer = setInterval(() => {
      const [d, g] = read();
      this.dragCount = d;
      const generalChanged = this.generalCount >= 0 && g !== this.generalCount;
      this.generalCount = g;
      if (generalChanged) this.onGeneralChange();
    }, POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
