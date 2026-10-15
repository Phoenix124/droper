interface Searchable {
  name: string;
  paths: string[];
}

/** Items whose name or paths contain every whitespace-separated word of the query (case-insensitive). */
export function filterItems<T extends Searchable>(items: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const haystack = [item.name, ...item.paths].join('\n').toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}
