import { describe, it, expect } from 'vitest';
import { shouldRemoveAfterDragOut } from '../src/core/dragOut';

const base = { operation: 'copy' as const, endedOnShelf: false, removeAfterDragOut: true };

describe('shouldRemoveAfterDragOut', () => {
  it('removes items another app accepted', () => {
    for (const operation of ['copy', 'move', 'link', 'generic'] as const) {
      expect(shouldRemoveAfterDragOut({ ...base, operation })).toBe(true);
    }
  });

  it('keeps items when the drop was cancelled or refused', () => {
    expect(shouldRemoveAfterDragOut({ ...base, operation: 'none' })).toBe(false);
  });

  it('keeps items dropped back onto the shelf itself', () => {
    expect(shouldRemoveAfterDragOut({ ...base, endedOnShelf: true })).toBe(false);
  });

  it('keeps items when the setting is off', () => {
    expect(shouldRemoveAfterDragOut({ ...base, removeAfterDragOut: false })).toBe(false);
  });
});
