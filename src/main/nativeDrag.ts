import { app } from 'electron';
import { join } from 'node:path';
import type { DragOperation } from '../core/dragOut.js';

export interface NativeDragEnd {
  operation: DragOperation;
  /** Screen point where the drag ended (DIPs on macOS, physical pixels on Windows). */
  x: number;
  y: number;
}

interface NativeDragAddon {
  /** On macOS onEnd fires later from the run loop; on Windows the call blocks and fires it before returning. */
  startDrag(handle: Buffer, paths: string[], onEnd: (end: NativeDragEnd) => void): boolean;
}

let addon: NativeDragAddon | null | undefined;

/** The addon reports what the drop target really did; null when it isn't built for this platform. */
export function nativeDrag(): NativeDragAddon | null {
  if (addon !== undefined) return addon;
  try {
    // Native modules are unpacked next to the asar archive in packaged builds.
    const base = app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked');
    addon = require(join(base, 'native', 'build', 'Release', 'droper_native.node')) as NativeDragAddon;
  } catch (err) {
    console.warn('Native drag addon unavailable, using fallback drag-out detection', err);
    addon = null;
  }
  return addon;
}
