import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

// JXA loop that prints "<dragChangeCount> <generalChangeCount>" whenever either changes.
// It exits on its own once orphaned (parent pid becomes launchd), so it never outlives Droper.
const SCRIPT = `
ObjC.import('AppKit');
ObjC.import('unistd');
const drag = $.NSPasteboard.pasteboardWithName('Apple CFPasteboard drag');
const general = $.NSPasteboard.generalPasteboard;
let d = -1, g = -1;
while ($.getppid() !== 1) {
  const nd = drag.changeCount, ng = general.changeCount;
  if (nd !== d || ng !== g) { d = nd; g = ng; console.log(d + ' ' + g); }
  delay(0.04);
}
`;

/**
 * macOS only. Watches the system drag pasteboard (changes whenever any app starts a real
 * drag session) and the general pasteboard (changes on every copy).
 */
export class MacPasteboardWatcher {
  dragCount = -1;
  generalCount = -1;
  private proc: ChildProcess | null = null;
  private stopped = false;

  constructor(private readonly onGeneralChange: () => void) {}

  start(): void {
    this.stopped = false;
    const proc = spawn('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT], { stdio: ['ignore', 'ignore', 'pipe'] });
    this.proc = proc;
    createInterface({ input: proc.stderr! }).on('line', (line) => {
      const [d, g] = line.trim().split(' ').map(Number);
      if (!Number.isFinite(d) || !Number.isFinite(g)) return;
      this.dragCount = d;
      const generalChanged = this.generalCount >= 0 && g !== this.generalCount;
      this.generalCount = g;
      if (generalChanged) this.onGeneralChange();
    });
    proc.on('exit', () => {
      if (this.proc === proc) this.proc = null;
      if (!this.stopped) setTimeout(() => this.start(), 1000);
    });
  }

  stop(): void {
    this.stopped = true;
    this.proc?.kill();
    this.proc = null;
  }
}
