/** Ids from `anchor` to `target` inclusive, in list order; just the target when the anchor is gone. */
export function rangeSelection(ids: string[], anchor: string | null, target: string): string[] {
  const a = anchor === null ? -1 : ids.indexOf(anchor);
  const b = ids.indexOf(target);
  if (b < 0) return [];
  if (a < 0) return [target];
  return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
}
