import { describe, it, expect } from 'vitest';
import { cleanPositions, placeAt, relativeTo } from '../src/core/shelfPlacement';

const area = { x: 1440, y: 25, width: 1920, height: 1055 };
const size = { width: 132, height: 460 };

describe('shelf placement', () => {
  it('round-trips a position relative to the display work area', () => {
    const rel = relativeTo({ x: 1500, y: 300, ...size }, area);
    expect(rel).toEqual({ x: 60, y: 275 });
    expect(placeAt(area, rel, size)).toEqual({ x: 1500, y: 300, ...size });
  });

  it('keeps the shelf fully on screen when the display or shelf size changed', () => {
    expect(placeAt(area, { x: 1900, y: 1000 }, size)).toEqual({ x: 1440 + 1920 - 132, y: 25 + 1055 - 460, ...size });
    expect(placeAt(area, { x: -50, y: -10 }, size)).toEqual({ x: 1440, y: 25, ...size });
  });
});

describe('cleanPositions', () => {
  it('keeps numeric display ids with finite coordinates only', () => {
    expect(cleanPositions({ '1': { x: 10, y: 20 }, abc: { x: 1, y: 1 }, '2': { x: 'a', y: 1 }, '3': null })).toEqual({ '1': { x: 10, y: 20 } });
    expect(cleanPositions(null)).toEqual({});
    expect(cleanPositions([1, 2])).toEqual({});
  });
});
