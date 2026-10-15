/** What the drop target did with dragged files, as reported by the OS drag session. */
export type DragOperation = 'none' | 'copy' | 'move' | 'link' | 'generic';

export interface DragOutResult {
  operation: DragOperation;
  /** The drag ended over the shelf (e.g. reordering), which is not "delivered elsewhere". */
  endedOnShelf: boolean;
  removeAfterDragOut: boolean;
}

/** Items leave the shelf only when another app actually accepted the drop. */
export function shouldRemoveAfterDragOut(r: DragOutResult): boolean {
  return r.removeAfterDragOut && !r.endedOnShelf && r.operation !== 'none';
}
