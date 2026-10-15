import { baseName } from './shelfStore.js';

/** Finder's naming: "<item>.zip" for one item, "Archive.zip" for several. */
export function archiveName(paths: string[]): string {
  return paths.length === 1 ? `${baseName(paths[0])}.zip` : 'Archive.zip';
}

/** Top-level entry names in the archive: base names, numbered when they clash (case-insensitively). */
export function entryNames(paths: string[]): string[] {
  const taken = new Set<string>();
  return paths.map((p) => {
    const name = baseName(p);
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} ${n}${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
