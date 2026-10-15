import { app } from 'electron';
import { execFile } from 'node:child_process';
import { watch, statSync, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isScreenshotCandidate, macScreenshotDir, RecentPaths } from '../core/screenshots.js';

const run = promisify(execFile);
const SETTLE_MS = 500;
/** Only files born this recently count, so renaming or touching an old image doesn't add it. */
const MAX_AGE_MS = 30_000;

/** Watches the system screenshot folder and reports each new screenshot once. */
export class ScreenshotWatcher {
  private watcher: FSWatcher | null = null;
  private generation = 0;
  private readonly recent = new RecentPaths(60_000);

  constructor(private readonly onScreenshot: (path: string) => void) {}

  async start(): Promise<void> {
    this.stop();
    const mine = ++this.generation;
    const dir = await screenshotDir();
    if (mine !== this.generation) return;
    try {
      this.watcher = watch(dir, (_event, name) => {
        if (name && isScreenshotCandidate(name)) setTimeout(() => void this.check(join(dir, name)), SETTLE_MS);
      });
      this.watcher.on('error', (err) => console.error('Screenshot watcher failed', err));
    } catch (err) {
      console.error('Cannot watch screenshot folder', dir, err);
    }
  }

  stop(): void {
    this.generation++;
    this.watcher?.close();
    this.watcher = null;
  }

  private async check(path: string): Promise<void> {
    try {
      const st = statSync(path);
      if (!st.isFile() || Date.now() - st.birthtimeMs > MAX_AGE_MS) return;
    } catch {
      return; // moved away or deleted already
    }
    if (!(await isScreenCapture(path)) || !this.watcher) return;
    if (this.recent.add(path, Date.now())) this.onScreenshot(path);
  }
}

async function screenshotDir(): Promise<string> {
  // Pictures\Screenshots is where Win+PrtScn and the Snipping Tool save.
  if (process.platform !== 'darwin') return join(app.getPath('pictures'), 'Screenshots');
  try {
    const { stdout } = await run('/usr/bin/defaults', ['read', 'com.apple.screencapture', 'location']);
    return macScreenshotDir(stdout, homedir());
  } catch {
    return macScreenshotDir(null, homedir());
  }
}

/** macOS tags captures with this attribute; the folder (often Desktop or Downloads) holds other files too. */
async function isScreenCapture(path: string): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  try {
    await run('/usr/bin/xattr', ['-p', 'com.apple.metadata:kMDItemIsScreenCapture', path]);
    return true;
  } catch {
    return false;
  }
}
