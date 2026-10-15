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
}

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
});

const TRIGGERS: readonly TriggerMode[] = ['dragStart', 'edge', 'atMouse', 'never'];
const SIDES: readonly ShelfSide[] = ['left', 'right'];

export function normalizeSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  if (TRIGGERS.includes(r.trigger as TriggerMode)) s.trigger = r.trigger as TriggerMode;
  if (SIDES.includes(r.side as ShelfSide)) s.side = r.side as ShelfSide;
  for (const key of ['removeAfterDragOut', 'autoHide', 'launchAtLogin', 'clipboardHistory'] as const) {
    if (typeof r[key] === 'boolean') s[key] = r[key];
  }
  if (typeof r.hotkey === 'string') s.hotkey = r.hotkey;
  if (Number.isInteger(r.clipboardLimit) && (r.clipboardLimit as number) > 0 && (r.clipboardLimit as number) <= 1000) {
    s.clipboardLimit = r.clipboardLimit as number;
  }
  return s;
}

export class SettingsStore {
  private current: Settings;
  private listeners = new Set<(changed: (keyof Settings)[]) => void>();

  constructor(private readonly file: JsonFile<Settings>) {
    this.current = normalizeSettings(file.read());
  }

  get(): Settings {
    return { ...this.current };
  }

  update(patch: Partial<Settings>): Settings {
    const next = normalizeSettings({ ...this.current, ...patch });
    const changed = (Object.keys(next) as (keyof Settings)[]).filter((k) => next[k] !== this.current[k]);
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
