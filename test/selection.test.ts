import { describe, it, expect } from 'vitest';
import { rangeSelection } from '../src/renderer/selection';

describe('rangeSelection', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('selects the inclusive range in either direction', () => {
    expect(rangeSelection(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeSelection(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('falls back to just the target when the anchor is gone', () => {
    expect(rangeSelection(ids, 'zzz', 'c')).toEqual(['c']);
    expect(rangeSelection(ids, null, 'c')).toEqual(['c']);
  });
});
