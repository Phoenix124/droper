import { describe, it, expect } from 'vitest';
import { EmptyShelfIdle, type EmptyShelfState } from '../src/core/emptyShelf';

const idle: EmptyShelfState = { visible: true, empty: true, autoHide: true, dragging: false, hovered: false };

describe('EmptyShelfIdle', () => {
  it('hides an empty, untouched shelf once the delay has passed', () => {
    const t = new EmptyShelfIdle(3000);
    expect(t.tick(idle, 0)).toBe(false);
    expect(t.tick(idle, 2999)).toBe(false);
    expect(t.tick(idle, 3000)).toBe(true);
  });

  it('never hides when autoHide is off, the shelf has items, or it is already hidden', () => {
    const t = new EmptyShelfIdle(1000);
    for (const over of [{ autoHide: false }, { empty: false }, { visible: false }]) {
      expect(t.tick({ ...idle, ...over }, 0)).toBe(false);
      expect(t.tick({ ...idle, ...over }, 5000)).toBe(false);
    }
  });

  it('restarts the countdown while the pointer is over the shelf or a drag is in progress', () => {
    const t = new EmptyShelfIdle(1000);
    t.tick(idle, 0);
    expect(t.tick({ ...idle, hovered: true }, 900)).toBe(false);
    expect(t.tick(idle, 1000)).toBe(false);
    expect(t.tick({ ...idle, dragging: true }, 1500)).toBe(false);
    expect(t.tick(idle, 1600)).toBe(false);
    expect(t.tick(idle, 2600)).toBe(true);
  });
});
