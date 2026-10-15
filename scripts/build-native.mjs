// Builds the optional native drag addon on macOS/Windows. Failure is not fatal: the app falls back
// to Electron's startDrag with a mouse-position heuristic.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!['darwin', 'win32'].includes(process.platform)) process.exit(0);
const root = fileURLToPath(new URL('..', import.meta.url));
const res = spawnSync('npx', ['node-gyp', 'rebuild', '--directory', 'native'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (res.status !== 0) console.warn('[droper] native drag addon failed to build; precise drag-out detection disabled');
