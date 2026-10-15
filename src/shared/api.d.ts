// Types shared by main, preload and renderer. Declaration-only so both TS builds can include it.

export interface ItemView {
  id: string;
  kind: 'file' | 'stack';
  name: string;
  paths: string[];
  count: number;
  locked: boolean;
  snippet: boolean;
  /** data: URL of a thumbnail or file icon. */
  thumb: string | null;
}

export type DroppedSnippet =
  | { kind: 'text'; text: string }
  | { kind: 'url'; url: string; title?: string }
  | { kind: 'image'; data: Uint8Array; mime: string; fileName?: string };

export interface ClipEntryView {
  id: string;
  kind: 'text' | 'link' | 'files' | 'image';
  preview: string;
  createdAt: number;
  pinned: boolean;
  thumb: string | null;
}

export interface SettingsView {
  trigger: 'dragStart' | 'edge' | 'atMouse' | 'never';
  side: 'left' | 'right';
  removeAfterDragOut: boolean;
  autoHide: boolean;
  hotkey: string;
  launchAtLogin: boolean;
  clipboardHistory: boolean;
  clipboardLimit: number;
  addScreenshots: boolean;
  shelfWidth: number;
  shelfHeight: number;
  iconSize: 'small' | 'medium' | 'large';
  ignoredApps: string[];
  confirmUrlActions: boolean;
}

export interface AppView {
  id: string;
  name: string;
  exe: string;
}

export interface ShelfAppearance {
  iconSize: 'small' | 'medium' | 'large';
}

export interface DroperApi {
  platform: string;
  shelf: {
    list(): Promise<ItemView[]>;
    onItems(cb: (items: ItemView[]) => void): void;
    onBeginRename(cb: (id: string) => void): void;
    addFiles(paths: string[]): void;
    addSnippets(snippets: DroppedSnippet[]): void;
    pathForFile(file: File): string;
    startDrag(ids: string[]): void;
    contextMenu(ids: string[]): void;
    open(ids: string[]): void;
    remove(ids: string[]): void;
    rename(id: string, name: string): Promise<string | null>;
    move(ids: string[], toIndex: number): void;
    hide(): void;
    menu(): void;
    /** Toggles the preview popover for the first id. */
    quickLook(ids: string[]): void;
    /** Shows the first id in the preview if it is already open. */
    previewFollow(ids: string[]): void;
    closePreview(): void;
    onPreviewState(cb: (open: boolean) => void): void;
    onAppearance(cb: (appearance: ShelfAppearance) => void): void;
  };
  clipboard: {
    list(): Promise<ClipEntryView[]>;
    onEntries(cb: (entries: ClipEntryView[]) => void): void;
    copy(id: string): void;
    toShelf(id: string): void;
    pin(id: string, pinned: boolean): void;
    remove(id: string): void;
    clear(): void;
  };
  settings: {
    get(): Promise<SettingsView>;
    update(patch: Partial<SettingsView>): Promise<SettingsView>;
    accessibilityStatus(): Promise<boolean>;
    requestAccessibility(): void;
    /** Apps that recently started drags, newest first, for quick-adding to the ignore list. */
    recentSources(): Promise<AppView[]>;
  };
}

export interface PreviewEntry {
  name: string;
  thumb: string | null;
}

export interface PreviewPayload {
  name: string;
  /** e.g. "1.2 MB · PDF · 14 Oct 2026" */
  info: string;
  kind: 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'folder' | 'other' | 'stack';
  /** file:// URL for image, pdf, video and audio. */
  src?: string;
  text?: string;
  truncated?: boolean;
  /** Large thumbnail or icon for 'other' and 'folder'. */
  thumb?: string | null;
  /** Members of a stack. */
  entries?: PreviewEntry[];
}

export interface PreviewApi {
  onShow(cb: (payload: PreviewPayload) => void): void;
}
