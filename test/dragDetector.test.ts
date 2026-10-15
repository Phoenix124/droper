import { describe, it, expect } from 'vitest';
import { DragDetector, type DragDetectorOptions, type Rect } from '../src/core/dragDetector';

const display: Rect = { x: 0, y: 0, width: 1000, height: 800 };

function setup(over: Partial<DragDetectorOptions> = {}) {
  const shows: Array<{ x: number; y: number }> = [];
  const ends: Array<{ x: number; y: number; wasDragging: boolean }> = [];
  const d = new DragDetector({
    mode: 'dragStart',
    threshold: 10,
    edgeSize: 4,
    displayAt: () => display,
    onShow: (p) => shows.push(p),
    onDragEnd: (p, wasDragging) => ends.push({ ...p, wasDragging }),
    ...over,
  });
  return { d, shows, ends };
}

describe('DragDetector', () => {
  it('does not fire for a click without movement', () => {
    const { d, shows, ends } = setup();
    d.mouseDown({ x: 100, y: 100 });
    d.mouseUp({ x: 100, y: 100 });
    expect(shows).toEqual([]);
    expect(ends).toEqual([{ x: 100, y: 100, wasDragging: false }]);
  });

  it('dragStart mode shows once after crossing threshold', () => {
    const { d, shows } = setup();
    d.mouseDown({ x: 100, y: 100 });
    d.mouseMove({ x: 105, y: 100 });
    expect(shows).toEqual([]);
    d.mouseMove({ x: 120, y: 100 });
    d.mouseMove({ x: 140, y: 100 });
    expect(shows).toEqual([{ x: 120, y: 100 }]);
  });

  it('reports drag end with dragging flag', () => {
    const { d, ends } = setup();
    d.mouseDown({ x: 100, y: 100 });
    d.mouseMove({ x: 150, y: 100 });
    d.mouseUp({ x: 150, y: 100 });
    expect(ends).toEqual([{ x: 150, y: 100, wasDragging: true }]);
  });

  it('ignores moves without a pressed button', () => {
    const { d, shows } = setup();
    d.mouseMove({ x: 500, y: 500 });
    expect(shows).toEqual([]);
  });

  it('edge mode shows only when cursor reaches left or right display edge', () => {
    const { d, shows } = setup({ mode: 'edge' });
    d.mouseDown({ x: 500, y: 300 });
    d.mouseMove({ x: 300, y: 300 });
    expect(shows).toEqual([]);
    d.mouseMove({ x: 2, y: 310 });
    d.mouseMove({ x: 1, y: 320 });
    expect(shows).toEqual([{ x: 2, y: 310 }]);
  });

  it('edge mode also fires on right edge of offset displays', () => {
    const { d, shows } = setup({ mode: 'edge', displayAt: () => ({ x: 1000, y: 0, width: 800, height: 600 }) });
    d.mouseDown({ x: 1400, y: 300 });
    d.mouseMove({ x: 1798, y: 300 });
    expect(shows).toEqual([{ x: 1798, y: 300 }]);
  });

  it('atMouse mode behaves like dragStart', () => {
    const { d, shows } = setup({ mode: 'atMouse' });
    d.mouseDown({ x: 0, y: 0 });
    d.mouseMove({ x: 30, y: 40 });
    expect(shows).toEqual([{ x: 30, y: 40 }]);
  });

  it('never mode does not show', () => {
    const { d, shows } = setup({ mode: 'never' });
    d.mouseDown({ x: 0, y: 0 });
    d.mouseMove({ x: 300, y: 300 });
    expect(shows).toEqual([]);
  });

  it('ignores drags that start inside the ignored rect', () => {
    const { d, shows, ends } = setup({ ignoreRect: () => ({ x: 0, y: 0, width: 50, height: 50 }) });
    d.mouseDown({ x: 10, y: 10 });
    d.mouseMove({ x: 300, y: 300 });
    d.mouseUp({ x: 300, y: 300 });
    expect(shows).toEqual([]);
    expect(ends).toEqual([]);
  });

  it('waits until the drag source check passes', () => {
    let real = false;
    const { d, shows } = setup({ isRealDrag: () => real });
    d.mouseDown({ x: 0, y: 0 });
    d.mouseMove({ x: 50, y: 0 });
    expect(shows).toEqual([]);
    real = true;
    d.mouseMove({ x: 60, y: 0 });
    expect(shows).toEqual([{ x: 60, y: 0 }]);
  });

  it('can change mode at runtime', () => {
    const { d, shows } = setup();
    d.setMode('never');
    d.mouseDown({ x: 0, y: 0 });
    d.mouseMove({ x: 300, y: 0 });
    expect(shows).toEqual([]);
  });

  it('passes the drag start point along with the show point', () => {
    const starts: Array<{ x: number; y: number }> = [];
    const { d } = setup({ onShow: (_p, start) => starts.push(start) });
    d.mouseDown({ x: 5, y: 6 });
    d.mouseMove({ x: 50, y: 6 });
    expect(starts).toEqual([{ x: 5, y: 6 }]);
  });
});


describe('DragDetector shake mode', () => {
  function shakeSetup(over: Partial<DragDetectorOptions> = {}) {
    let t = 0;
    const s = setup({ mode: 'shake', now: () => t, ...over });
    return { ...s, at: (ms: number) => (t = ms) };
  }

  it('shows after the pointer reverses direction three times quickly', () => {
    const { d, shows, at } = shakeSetup();
    d.mouseDown({ x: 300, y: 300 });
    const xs = [340, 380, 340, 300, 340, 380, 340];
    xs.forEach((x, i) => {
      at(i * 60);
      d.mouseMove({ x, y: 300 });
    });
    expect(shows).toEqual([{ x: 340, y: 300 }]);
  });

  it('does not show for a plain drag in one direction', () => {
    const { d, shows, at } = shakeSetup();
    d.mouseDown({ x: 100, y: 300 });
    for (let i = 1; i <= 20; i++) {
      at(i * 30);
      d.mouseMove({ x: 100 + i * 30, y: 300 });
    }
    expect(shows).toEqual([]);
  });

  it('ignores slow back-and-forth and tiny jitter', () => {
    const { d, shows, at } = shakeSetup();
    d.mouseDown({ x: 300, y: 300 });
    // Slow: one reversal per second.
    [380, 300, 380, 300].forEach((x, i) => {
      at(i * 1000);
      d.mouseMove({ x, y: 300 });
    });
    // Jitter: reversals under the minimum travel.
    [305, 300, 305, 300, 305, 300].forEach((x, i) => {
      at(5000 + i * 20);
      d.mouseMove({ x, y: 300 });
    });
    expect(shows).toEqual([]);
  });

  it('still needs a real drag', () => {
    const { d, shows, at } = shakeSetup({ isRealDrag: () => false });
    d.mouseDown({ x: 300, y: 300 });
    [340, 380, 340, 300, 340, 380, 340].forEach((x, i) => {
      at(i * 60);
      d.mouseMove({ x, y: 300 });
    });
    expect(shows).toEqual([]);
  });
});
