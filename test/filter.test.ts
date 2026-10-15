import { describe, it, expect } from 'vitest';
import { filterItems } from '../src/renderer/filter';

const items = [
  { id: '1', name: 'Invoice March.pdf', paths: ['/Users/me/Docs/Invoice March.pdf'] },
  { id: '2', name: '3 items', paths: ['/x/photo.jpg', '/x/report-final.docx', '/x/notes.txt'] },
  { id: '3', name: 'Screenshot.png', paths: ['C:\\Users\\me\\Pictures\\Screenshot.png'] },
];

describe('filterItems', () => {
  it('returns everything for a blank query', () => {
    expect(filterItems(items, '  ')).toEqual(items);
  });

  it('matches names case-insensitively', () => {
    expect(filterItems(items, 'invoice').map((i) => i.id)).toEqual(['1']);
  });

  it('matches file names inside stacks', () => {
    expect(filterItems(items, 'report').map((i) => i.id)).toEqual(['2']);
  });

  it('requires every word to match', () => {
    expect(filterItems(items, 'invoice march').map((i) => i.id)).toEqual(['1']);
    expect(filterItems(items, 'invoice png')).toEqual([]);
  });

  it('matches folder names in the path', () => {
    expect(filterItems(items, 'pictures').map((i) => i.id)).toEqual(['3']);
  });
});
