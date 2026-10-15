import type { Point, Rect } from './dragDetector.js';

/** Shelf position as an offset from the display's work area, so it survives resolution and arrangement changes. */
export function relativeTo(bounds: Rect, area: Rect): Point {
  return { x: bounds.x - area.x, y: bounds.y - area.y };
}

/** Bounds for the shelf at a remembered offset, kept fully inside the work area. */
export function placeAt(area: Rect, rel: Point, size: { width: number; height: number }): Rect {
  const x = Math.min(Math.max(area.x + rel.x, area.x), area.x + area.width - size.width);
  const y = Math.min(Math.max(area.y + rel.y, area.y), area.y + area.height - size.height);
  return { x: Math.round(x), y: Math.round(y), width: size.width, height: size.height };
}

export type ShelfPositions = Record<string, Point>;

/** Positions file contents, dropping anything malformed. Keys are display ids. */
export function cleanPositions(raw: unknown): ShelfPositions {
  const out: ShelfPositions = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = v as Partial<Point> | null;
    if (/^\d+$/.test(id) && p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[id] = { x: p.x!, y: p.y! };
  }
  return out;
}
