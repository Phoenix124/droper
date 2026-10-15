import { app, screen } from 'electron';
import { join } from 'node:path';
import type { Point } from '../core/dragDetector.js';
import type { DragOperation } from '../core/dragOut.js';
import type { AppIdentity } from '../core/ignoredApps.js';

export interface NativeDragEnd {
  operation: DragOperation;
  /** Screen point where the drag ended (DIPs on macOS, physical pixels on Windows). */
  x: number;
  y: number;
}

interface NativeDragAddon {
  /** On macOS onEnd fires later from the run loop; on Windows the call blocks and fires it before returning. */
  startDrag(handle: Buffer, paths: string[], onEnd: (end: NativeDragEnd) => void): boolean;
  /** Takes points (macOS) or physical pixels (Windows). */
  appAtPoint(x: number, y: number): AppIdentity | null;
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

/** App owning the window under a screen point (DIPs), or null if unknown. */
export function appAtPoint(p: Point): AppIdentity | null {
  const native = nativeDrag();
  if (!native?.appAtPoint) return null;
  const q = process.platform === 'win32' ? screen.dipToScreenPoint(p) : p;
  try {
    return native.appAtPoint(q.x, q.y);
  } catch {
    return null;
  }
}
