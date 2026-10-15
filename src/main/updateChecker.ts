import { app, net, Notification, shell } from 'electron';
import { JsonFile } from '../core/jsonFile.js';
import { compareVersions, isCheckDue, parseLatestRelease, RELEASES_API, type LatestRelease } from '../core/updates.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60_000;
const TICK_MS = 60 * 60 * 1000;

interface UpdateState {
  lastCheck: number | null;
  /** Version we already showed a notification for, so each release notifies once. */
  notified: string | null;
}

/**
 * Asks GitHub once a day whether a newer release exists and points people at its page. It never
 * downloads or installs anything: unsigned builds can't be updated safely in place.
 */
export class UpdateChecker {
  private state: UpdateState;
  private timer: NodeJS.Timeout | null = null;
  private first: NodeJS.Timeout | null = null;
  available: LatestRelease | null = null;

  constructor(private readonly file: JsonFile<UpdateState>, private readonly onChange: () => void) {
    const raw = file.read();
    this.state = {
      lastCheck: typeof raw?.lastCheck === 'number' ? raw.lastCheck : null,
      notified: typeof raw?.notified === 'string' ? raw.notified : null,
    };
  }

  start(): void {
    if (this.timer) return;
    // Not right at launch: login items start before the network is up.
    this.first = setTimeout(() => void this.tick(), FIRST_CHECK_DELAY_MS);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
    this.first = this.timer = null;
  }

  /** Checks now; resolves to the newer release, null when up to date, or throws on network errors. */
  async check(): Promise<LatestRelease | null> {
    const res = await net.fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Droper/${app.getVersion()}` },
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const latest = parseLatestRelease(await res.json());
    this.state.lastCheck = Date.now();
    this.file.write(this.state);
    const newer = latest && compareVersions(latest.version, app.getVersion()) > 0 ? latest : null;
    if (newer?.version !== this.available?.version) {
      this.available = newer;
      this.onChange();
    }
    return newer;
  }

  openReleasePage(): void {
    if (this.available) void shell.openExternal(this.available.url);
  }

  private async tick(): Promise<void> {
    if (!isCheckDue(this.state.lastCheck, Date.now(), DAY_MS)) return;
    try {
      const newer = await this.check();
      if (newer && this.state.notified !== newer.version && Notification.isSupported()) {
        this.state.notified = newer.version;
        this.file.write(this.state);
        const n = new Notification({ title: `Droper ${newer.version} is available`, body: 'Click to open the release page.' });
        n.on('click', () => this.openReleasePage());
        n.show();
      }
    } catch (err) {
      console.warn('Update check failed', err);
    }
  }
}
