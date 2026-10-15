import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Small JSON document on disk, written atomically via temp file + rename. */
export class JsonFile<T = unknown> {
  constructor(readonly path: string) {}

  read(): T | null {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  write(data: T): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}
