import type { TriggerMode } from './dragDetector.js';
import type { JsonFile } from './jsonFile.js';

export type ShelfSide = 'left' | 'right';

export interface Settings {
  /** When the shelf appears during a drag. */
  trigger: TriggerMode;
  side: ShelfSide;
  /** Remove items from the shelf after they were dragged out of it (locked items stay). */
  removeAfterDragOut: boolean;
  /** Hide the shelf again when a drag ends and nothing is on it. */
  autoHide: boolean;
  /** Electron accelerator that toggles the shelf. Empty disables it. */
  hotkey: string;
  launchAtLogin: boolean;
  clipboardHistory: boolean;
  clipboardLimit: number;
  /** Put new screenshots on the shelf as they are saved. */
  addScreenshots: boolean;
  shelfWidth: number;
  shelfHeight: number;
  iconSize: IconSize;
  /** Ask before droper:// links add files or clear the shelf. */
  confirmUrlActions: boolean;
  /** Drags starting in these apps (bundle id, app name or exe name) don't bring up the shelf. */
  ignoredApps: string[];
}

export type IconSize = 'small' | 'medium' | 'large';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  // Windows has no drag pasteboard to tell file drags from window moves, so the edge is a safer default there.
  trigger: process.platform === 'win32' ? 'edge' : 'dragStart',
  side: 'right',
  removeAfterDragOut: true,
  autoHide: true,
  hotkey: 'CommandOrControl+Shift+Y',
  launchAtLogin: false,
  clipboardHistory: false,
  clipboardLimit: 50,
  addScreenshots: false,
  shelfWidth: 132,
  shelfHeight: 460,
  iconSize: 'medium',
  confirmUrlActions: true,
  ignoredApps: [],
});

export const SHELF_WIDTH = { min: 100, max: 260 } as const;
export const SHELF_HEIGHT = { min: 280, max: 1000 } as const;
const ICON_SIZES: readonly IconSize[] = ['small', 'medium', 'large'];
const MAX_IGNORED = 100;
const MAX_IGNORED_LENGTH = 200;

function clampInt(v: unknown, range: { min: number; max: number }): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(range.max, Math.max(range.min, Math.round(v)));
}

function cleanIgnored(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== 'string') continue;
    const entry = raw.trim();
    const key = entry.toLowerCase();
    if (!entry || entry.length > MAX_IGNORED_LENGTH || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= MAX_IGNORED) break;
  }
  return out;
}

const TRIGGERS: readonly TriggerMode[] = ['dragStart', 'edge', 'atMouse', 'never'];
const SIDES: readonly ShelfSide[] = ['left', 'right'];

export function normalizeSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ignoredApps: [...DEFAULT_SETTINGS.ignoredApps] };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  if (TRIGGERS.includes(r.trigger as TriggerMode)) s.trigger = r.trigger as TriggerMode;
  if (SIDES.includes(r.side as ShelfSide)) s.side = r.side as ShelfSide;
  for (const key of ['removeAfterDragOut', 'autoHide', 'launchAtLogin', 'clipboardHistory', 'confirmUrlActions', 'addScreenshots'] as const) {
    if (typeof r[key] === 'boolean') s[key] = r[key];
  }
  if (typeof r.hotkey === 'string') s.hotkey = r.hotkey;
  if (Number.isInteger(r.clipboardLimit) && (r.clipboardLimit as number) > 0 && (r.clipboardLimit as number) <= 1000) {
    s.clipboardLimit = r.clipboardLimit as number;
  }
  s.shelfWidth = clampInt(r.shelfWidth, SHELF_WIDTH) ?? s.shelfWidth;
  s.shelfHeight = clampInt(r.shelfHeight, SHELF_HEIGHT) ?? s.shelfHeight;
  if (ICON_SIZES.includes(r.iconSize as IconSize)) s.iconSize = r.iconSize as IconSize;
  s.ignoredApps = cleanIgnored(r.ignoredApps) ?? s.ignoredApps;
  return s;
}

export class SettingsStore {
  private current: Settings;
  private listeners = new Set<(changed: (keyof Settings)[]) => void>();

  constructor(private readonly file: JsonFile<Settings>) {
    this.current = normalizeSettings(file.read());
  }

  get(): Settings {
    return { ...this.current, ignoredApps: [...this.current.ignoredApps] };
  }

  update(patch: Partial<Settings>): Settings {
    const next = normalizeSettings({ ...this.current, ...patch });
    const changed = (Object.keys(next) as (keyof Settings)[]).filter(
      (k) => JSON.stringify(next[k]) !== JSON.stringify(this.current[k]),
    );
    if (!changed.length) return this.get();
    this.current = next;
    this.file.write(next);
    for (const l of this.listeners) l(changed);
    return this.get();
  }

  onChange(listener: (changed: (keyof Settings)[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
