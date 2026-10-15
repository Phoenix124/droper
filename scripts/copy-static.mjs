import { cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src/renderer');
const out = join(root, 'dist/renderer');
for (const name of readdirSync(src)) {
  if (name.endsWith('.html') || name.endsWith('.css')) cpSync(join(src, name), join(out, name));
}
