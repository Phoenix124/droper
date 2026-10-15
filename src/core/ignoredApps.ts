export interface AppIdentity {
  /** macOS bundle identifier, e.g. com.apple.finder. */
  id: string;
  /** Display name, e.g. Finder. */
  name: string;
  /** Windows executable name, e.g. explorer.exe. */
  exe: string;
}

/** True when any entry equals the app's bundle id, name or exe name (case-insensitive). */
export function isIgnoredApp(app: AppIdentity | null, ignored: string[]): boolean {
  if (!app) return false;
  const keys = new Set([app.id, app.name, app.exe].filter(Boolean).map((k) => k.toLowerCase()));
  return ignored.some((entry) => entry.trim() !== '' && keys.has(entry.trim().toLowerCase()));
}
