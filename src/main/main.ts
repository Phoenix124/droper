import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
  systemPreferences,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ClipboardHistory, type ClipContent, type ClipEntry } from '../core/clipboardHistory.js';
import { contains, type Point } from '../core/dragDetector.js';
import { shouldRemoveAfterDragOut } from '../core/dragOut.js';
import { saveSnippet, type SnippetPayload } from '../core/ingest.js';
import { isWebLink, renameTarget } from '../core/fileNames.js';
import { isIgnoredApp, type AppIdentity } from '../core/ignoredApps.js';
import { JsonFile } from '../core/jsonFile.js';
import { latestOnly } from '../core/latest.js';
import { SettingsStore, type Settings } from '../core/settings.js';
import { ShelfStore, type ShelfItem, type ShelfState } from '../core/shelfStore.js';
import { isDisplaySafePath, needsConfirmation, parseDroperUrl, type UrlAction } from '../core/urlScheme.js';
import type { ClipEntryView, ItemView } from '../shared/api';
import { DragWatcher } from './dragWatcher.js';
import { MacPasteboardWatcher } from './macPasteboard.js';
import { appAtPoint, nativeDrag, type NativeDragEnd } from './nativeDrag.js';
import {
  copyFiles,
  dragIconFor,
  forgetThumbnail,
  isImagePath,
  readClipboard,
  thumbnailFor,
  type ClipboardSnapshot,
  writeClipboardImage,
  writeClipboardText,
} from './platform.js';
import { PreviewWindow } from './previewWindow.js';
import { ShelfWindow } from './shelfWindow.js';
import { trayIcon } from './trayIcon.js';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const MAX_SNIPPET_BYTES = 200 * 1024 * 1024;

const pendingPaths: string[] = [];
const pendingUrls: string[] = [];
let controller: Controller | null = null;

function openPaths(paths: string[]): void {
  if (controller) controller.addExternalPaths(paths);
  else pendingPaths.push(...paths);
}

function openUrls(urls: string[]): void {
  if (controller) urls.forEach((u) => void controller!.handleUrl(u));
  else pendingUrls.push(...urls);
}

/** droper:// links passed on the command line (Windows delivers protocol launches this way). */
function urlsFromArgv(argv: string[]): string[] {
  return argv.filter((a) => a.toLowerCase().startsWith('droper:'));
}

function registerProtocol(): void {
  // In development the app is `electron .`, so Electron has to be told which script to launch.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('droper', process.execPath, [resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient('droper');
  }
}

/** Absolute, existing file arguments (from "Send To", "Open With" or a second launch). */
function pathsFromArgv(argv: string[]): string[] {
  const skip = new Set([process.execPath, app.getAppPath()]);
  return argv.slice(1).filter((a) => !a.startsWith('-') && isAbsolute(a) && !skip.has(a) && existsSync(a));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const urls = urlsFromArgv(argv);
    const paths = pathsFromArgv(argv);
    if (urls.length) openUrls(urls);
    if (paths.length) openPaths(paths);
    if (!urls.length && !paths.length) controller?.toggleShelf();
  });
  app.on('open-file', (e, path) => {
    e.preventDefault();
    openPaths([path]);
  });
  // Clicking the app icon again while it runs (Dock, Launchpad, Finder) shows the shelf.
  app.on('activate', () => controller?.showShelfOnLaunch());
  app.on('open-url', (e, url) => {
    e.preventDefault();
    openUrls([url]);
  });
  // No window ever navigates away from its bundled page or opens new windows; a file dropped on a
  // settings window would otherwise load as a page that still has the preload API.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (ev) => ev.preventDefault());
    // Sub-frames exist only for the PDF preview: allow the PDF itself and Chromium's built-in viewer.
    contents.on('will-frame-navigate', (ev) => {
      if (ev.isMainFrame) return;
      const pdf = ev.url.startsWith('file:') && /\.pdf$/i.test(new URL(ev.url).pathname);
      if (!pdf && !ev.url.startsWith('chrome-extension:')) ev.preventDefault();
    });
    contents.on('will-redirect', (ev) => ev.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
  app.on('window-all-closed', () => {
    // Menu-bar / tray app: keep running without windows.
  });
  app.whenReady().then(() => {
    if (isMac) app.dock?.hide();
    // No page needs camera, notifications, clipboard-read etc.; deny every permission request.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    registerProtocol();
    controller = new Controller();
    openPaths([...pendingPaths, ...pathsFromArgv(process.argv)]);
    openUrls([...pendingUrls, ...urlsFromArgv(process.argv)]);
    // A menu-bar app shows no window on launch; when the user starts it by hand, show the shelf so
    // something visibly happens. Stay quiet when launched at login.
    const atLogin = app.getLoginItemSettings().wasOpenedAtLogin || process.argv.includes('--hidden');
    if (!atLogin && !pendingPaths.length && !pendingUrls.length) controller.showShelfOnLaunch();
    pendingPaths.length = 0;
    pendingUrls.length = 0;
  });
}

class Controller {
  private readonly dataDir = app.getPath('userData');
  private readonly snippetsDir = join(this.dataDir, 'Snippets');
  private readonly clipImagesDir = join(this.dataDir, 'ClipImages');
  private readonly settings = new SettingsStore(new JsonFile<Settings>(join(this.dataDir, 'settings.json')));
  private readonly store: ShelfStore;
  private readonly history: ClipboardHistory;
  private readonly shelf = new ShelfWindow();
  private readonly preview = new PreviewWindow((open) => this.shelf.send('shelf:previewState', open));
  private readonly pasteboard: MacPasteboardWatcher | null;
  private readonly watcher: DragWatcher;
  private readonly tray: Tray;
  private settingsWin: BrowserWindow | null = null;
  private clipWin: BrowserWindow | null = null;
  private outgoing: string[] | null = null;
  private shownByDrag = false;
  private latestClip: ClipContent | null = null;
  private clipTimer: NodeJS.Timeout | null = null;
  private captureChain: Promise<void> = Promise.resolve();
  /** Bumped when history is turned off, so captures already in flight are dropped. */
  private clipSession = 0;
  private hookRunning = false;
  private recentSources: AppIdentity[] = [];
  private urlSnippetTimes: number[] = [];

  constructor() {
    mkdirSync(this.snippetsDir, { recursive: true });
    mkdirSync(this.clipImagesDir, { recursive: true });

    const shelfFile = new JsonFile<ShelfState>(join(this.dataDir, 'shelf.json'));
    this.store = new ShelfStore({
      persistence: { load: () => shelfFile.read(), save: (s) => shelfFile.write(s) },
      exists: existsSync,
      onDiscard: (item) => this.discardSnippetFiles(item),
    });
    const clipFile = new JsonFile<{ entries: ClipEntry[] }>(join(this.dataDir, 'clipboard.json'));
    this.history = new ClipboardHistory({
      read: () => this.latestClip,
      limit: this.settings.get().clipboardLimit,
      persistence: { load: () => clipFile.read(), save: (s) => clipFile.write(s) },
      onDiscard: (entry) => this.discardClipImage(entry),
    });
    this.cleanupClipImages();

    this.pasteboard = isMac && MacPasteboardWatcher.available() ? new MacPasteboardWatcher(() => void this.captureClipboard()) : null;
    this.pasteboard?.start();

    this.watcher = new DragWatcher(
      {
        mode: this.settings.get().trigger,
        shelfBounds: () => this.shelf.bounds(),
        onShow: (p, start) => this.onDragShow(p, start),
        onDragEnd: () => this.onDragEnd(),
        onMouseUp: (p) => this.onMouseUp(p),
      },
      this.pasteboard,
    );

    this.tray = new Tray(trayIcon());
    this.tray.setToolTip('Droper');
    this.tray.on('click', () => {
      if (isWin) this.toggleShelf();
    });
    this.refreshTrayMenu();

    this.store.onChange(() => this.onStoreChange());
    this.history.onChange(() => void this.broadcastClips());
    this.settings.onChange((keys) => this.applySettings(keys));

    this.registerIpc();
    this.applySettings(['hotkey', 'launchAtLogin', 'clipboardHistory', 'shelfWidth']);
    this.startHookWhenPermitted();
    this.installSendTo();

    this.shelf.win.webContents.once('did-finish-load', () => {
      void this.broadcastItems();
      this.sendAppearance();
    });
    // The preview is anchored to the shelf, so it goes away when the shelf hides or is dragged elsewhere.
    this.shelf.win.on('hide', () => this.preview.hide());
    this.shelf.win.on('move', () => this.preview.hide());
    setInterval(() => {
      if (this.shelf.visible) this.store.pruneMissing();
    }, 3000);
    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
      this.watcher.stop();
      this.pasteboard?.stop();
    });
  }

  // ---- shelf visibility -------------------------------------------------

  showShelfOnLaunch(): void {
    if (!this.shelf.visible) this.showShelf();
  }

  toggleShelf(): void {
    if (this.shelf.visible) this.shelf.hide();
    else this.showShelf();
  }

  private showShelf(): void {
    this.shownByDrag = false;
    this.shelf.showAt(this.settings.get().side, screen.getCursorScreenPoint());
  }

  private onDragShow(p: Point, start: Point): void {
    const s = this.settings.get();
    const source = appAtPoint(start);
    if (source) this.rememberSource(source);
    if (isIgnoredApp(source, s.ignoredApps)) return;
    const wasVisible = this.shelf.visible;
    this.shelf.showAt(s.side, p, s.trigger === 'atMouse');
    if (!wasVisible) this.shownByDrag = true;
  }

  private onDragEnd(): void {
    this.scheduleAutoHide();
  }

  /** Prefers the native drag, which reports whether the drop target accepted the files. */
  private startDragOut(ids: string[], paths: string[], sender: Electron.WebContents): void {
    const native = nativeDrag();
    if (native) {
      try {
        if (native.startDrag(this.shelf.win.getNativeWindowHandle(), paths, (end) => this.onNativeDragEnd(ids, end))) return;
      } catch (err) {
        console.error('Native drag failed, falling back', err);
      }
    }
    this.outgoing = ids;
    sender.startDrag({ file: paths[0], files: paths, icon: dragIconFor(paths) });
  }

  private onNativeDragEnd(ids: string[], end: NativeDragEnd): void {
    const p = isWin ? screen.screenToDipPoint({ x: end.x, y: end.y }) : { x: end.x, y: end.y };
    const bounds = this.shelf.bounds();
    const remove = shouldRemoveAfterDragOut({
      operation: end.operation,
      endedOnShelf: bounds !== null && contains(bounds, p),
      removeAfterDragOut: this.settings.get().removeAfterDragOut,
    });
    if (remove) this.store.remove(ids);
  }

  /** Fallback when the native addon is missing: decides by where the mouse was released. */
  private onMouseUp(p: Point): void {
    const ids = this.outgoing;
    if (!ids) return;
    this.outgoing = null;
    const bounds = this.shelf.bounds();
    const droppedOutside = !bounds || !contains(bounds, p);
    if (droppedOutside && this.settings.get().removeAfterDragOut) this.store.remove(ids);
  }

  private scheduleAutoHide(): void {
    // Give a drop on the shelf time to arrive through IPC before deciding it stayed empty.
    setTimeout(() => {
      if (this.settings.get().autoHide && this.shownByDrag && this.store.items().length === 0) this.shelf.hide();
    }, 700);
  }

  private onStoreChange(): void {
    void this.broadcastItems();
    this.refreshPreview();
    this.refreshTrayMenu();
    if (this.store.items().length === 0 && this.settings.get().autoHide && !this.watcher.isDragging) {
      this.shownByDrag = true;
      this.scheduleAutoHide();
    }
  }

  /** Newest first, unique, for the "recent drag sources" quick-add buttons in settings. */
  private rememberSource(app: AppIdentity): void {
    const key = (a: AppIdentity) => (a.id || a.exe || a.name).toLowerCase();
    this.recentSources = [app, ...this.recentSources.filter((a) => key(a) !== key(app))].slice(0, 8);
  }

  // ---- URL scheme ---------------------------------------------------------

  /** Any web page can open droper:// links, so they are untrusted input. */
  async handleUrl(raw: string): Promise<void> {
    let action = parseDroperUrl(raw);
    if (!action) return;
    if (action.type === 'add') {
      // Resolve symlinks so the confirmation shows what would really end up on the shelf.
      const paths = action.paths.flatMap((p) => {
        try {
          return [realpathSync(p)];
        } catch {
          return [];
        }
      });
      // A harmless-looking symlink may resolve to a deceptive target; refuse the link then.
      if (!paths.length || !paths.every(isDisplaySafePath)) return;
      action = { type: 'add', paths };
    }
    if (needsConfirmation(action) && this.settings.get().confirmUrlActions && !(await this.confirmUrlAction(action))) return;
    switch (action.type) {
      case 'show':
        if (!this.shelf.visible) this.showShelf();
        break;
      case 'hide':
        this.shelf.hide();
        break;
      case 'toggle':
        this.toggleShelf();
        break;
      case 'clear':
        this.store.clear();
        break;
      case 'restore':
        this.store.restoreLastRemoved();
        if (!this.shelf.visible) this.showShelf();
        break;
      case 'add':
        this.addExternalPaths(action.paths);
        break;
      case 'addText':
        if (!this.allowUrlSnippet()) return;
        this.addSnippets([{ kind: 'text', text: action.text }]);
        if (!this.shelf.visible) this.showShelf();
        break;
      case 'addUrl':
        if (!this.allowUrlSnippet()) return;
        this.addSnippets([{ kind: 'url', url: action.url, title: action.title }]);
        if (!this.shelf.visible) this.showShelf();
        break;
    }
  }

  /** Links can be fired repeatedly by a web page; cap how many snippet files they may create. */
  private allowUrlSnippet(): boolean {
    const now = Date.now();
    this.urlSnippetTimes = this.urlSnippetTimes.filter((t) => now - t < 60_000);
    if (this.urlSnippetTimes.length >= 10) return false;
    this.urlSnippetTimes.push(now);
    return true;
  }

  private async confirmUrlAction(action: UrlAction): Promise<boolean> {
    // The parser caps links at MAX_URL_PATHS and rejects control/bidi characters, so every path is shown verbatim.
    const shown = action.type === 'add' ? action.paths.join('\n') : '';
    if (isMac) app.focus({ steal: true });
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: [action.type === 'add' ? 'Add to Shelf' : 'Clear Shelf', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: action.type === 'add' ? 'A droper:// link wants to add files to your shelf' : 'A droper:// link wants to clear your shelf',
      detail: action.type === 'add' ? `${shown}\n\nOnly continue if you started this yourself.` : 'Only continue if you started this yourself.',
    });
    return response === 0;
  }

  // ---- shelf content ----------------------------------------------------

  addExternalPaths(paths: string[]): void {
    const added = this.store.addPaths(paths.filter((p) => isAbsolute(p) && existsSync(p)));
    if (added.length && !this.shelf.visible) this.showShelf();
  }

  private addSnippets(payloads: SnippetPayload[]): void {
    const paths: string[] = [];
    for (const p of payloads) {
      try {
        paths.push(saveSnippet(this.snippetsDir, p));
      } catch (err) {
        console.error('Could not save dropped content', err);
      }
    }
    this.store.addPaths(paths, { snippet: true });
  }

  /** Files inside Snippets/ belong to Droper whatever item (or stack) they ended up in. */
  private discardSnippetFiles(item: ShelfItem): void {
    const inUse = new Set(this.store.items().flatMap((i) => i.paths));
    for (const p of item.paths) {
      if (p.startsWith(this.snippetsDir + sep) && !inUse.has(p)) rmSync(p, { force: true, recursive: true });
    }
  }

  private async itemViews(): Promise<ItemView[]> {
    return Promise.all(
      this.store.items().map(async (i) => {
        const thumb = await thumbnailFor(i.paths[0]);
        return {
          id: i.id,
          kind: i.kind,
          name: i.name,
          paths: i.paths,
          count: i.paths.length,
          locked: i.locked,
          snippet: i.snippet,
          thumb: thumb ? thumb.toDataURL() : null,
        };
      }),
    );
  }

  /** Thumbnails load asynchronously; only the newest list may reach the renderer. */
  private readonly broadcastItems = latestOnly(
    () => this.itemViews(),
    (views) => this.shelf.send('shelf:items', views),
  );

  private renameItem(id: string, rawName: string): string | null {
    const item = this.store.items().find((i) => i.id === id);
    if (!item || item.kind !== 'file') return null;
    const from = item.paths[0];
    const to = renameTarget(from, rawName, existsSync);
    if (!to) return null;
    const name = basename(to);
    if (to === from) return name;
    try {
      renameSync(from, to);
    } catch {
      return null;
    }
    forgetThumbnail(from);
    this.store.replacePath(id, from, to);
    return name;
  }

  // ---- preview ----------------------------------------------------------

  private toggleQuickLook(ids: string[]): void {
    const item = this.store.items().find((i) => i.id === ids[0]);
    const bounds = this.shelf.bounds();
    if (!item || !bounds) return;
    if (this.preview.openId === item.id) this.preview.hide();
    else void this.preview.show(item, bounds);
  }

  private followPreview(ids: string[]): void {
    if (this.preview.openId === null || this.preview.openId === ids[0]) return;
    const item = this.store.items().find((i) => i.id === ids[0]);
    const bounds = this.shelf.bounds();
    if (item && bounds) void this.preview.show(item, bounds);
  }

  /** Keeps an open preview in sync after renames, removals and stack changes. */
  private refreshPreview(): void {
    const id = this.preview.openId;
    if (id === null) return;
    const item = this.store.items().find((i) => i.id === id);
    const bounds = this.shelf.bounds();
    if (item && bounds) void this.preview.show(item, bounds);
    else this.preview.hide();
  }

  // ---- menus ------------------------------------------------------------

  private trayTemplate(): MenuItemConstructorOptions[] {
    const s = this.settings.get();
    const items: MenuItemConstructorOptions[] = [
      { label: this.shelf.visible ? 'Hide Shelf' : 'Show Shelf', accelerator: s.hotkey || undefined, click: () => this.toggleShelf() },
      { label: 'Add Clipboard to Shelf', click: () => void this.clipboardToShelf() },
      { label: 'Restore Removed Items', enabled: this.store.hasRemoved(), click: () => this.store.restoreLastRemoved() },
      { label: 'Clear Shelf', enabled: this.store.items().length > 0, click: () => this.store.clear() },
      { type: 'separator' },
      { label: 'Clipboard History…', click: () => this.openClipboardWindow() },
      { label: 'Settings…', click: () => this.openSettingsWindow() },
    ];
    if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) {
      items.push({ type: 'separator' }, { label: '⚠︎ Allow Accessibility to detect drags…', click: () => this.requestAccessibility() });
    }
    items.push({ type: 'separator' }, { label: 'Quit Droper', role: 'quit' });
    return items;
  }

  private refreshTrayMenu(): void {
    this.tray.setContextMenu(Menu.buildFromTemplate(this.trayTemplate()));
  }

  private itemMenu(ids: string[], sender: Electron.WebContents): Menu {
    const all = this.store.items();
    const selected = all.filter((i) => ids.includes(i.id));
    const paths = selected.flatMap((i) => i.paths);
    const single = selected.length === 1 ? selected[0] : null;
    const anyUnlocked = selected.some((i) => !i.locked);
    const template: MenuItemConstructorOptions[] = [
      { label: 'Open', click: () => paths.forEach((p) => void shell.openPath(p)) },
      { label: 'Quick Look', click: () => this.toggleQuickLook(ids) },
      { label: isMac ? 'Show in Finder' : 'Show in Explorer', click: () => shell.showItemInFolder(paths[0]) },
      { type: 'separator' },
      { label: isMac ? 'Copy' : 'Copy Path', click: () => void copyFiles(paths) },
      { label: 'Copy Path', visible: isMac, click: () => void writeClipboardText(paths.join('\n')) },
    ];
    if (isMac) template.push({ role: 'shareMenu', sharingItem: { filePaths: paths } });
    template.push(
      { type: 'separator' },
      { label: 'Rename…', enabled: single?.kind === 'file', click: () => sender.send('shelf:beginRename', single!.id) },
      { label: anyUnlocked ? 'Lock' : 'Unlock', click: () => this.store.setLocked(ids, anyUnlocked) },
      { label: 'Merge into Stack', enabled: selected.length > 1, click: () => this.store.mergeToStack(ids) },
      { label: 'Split Stack', visible: single?.kind === 'stack', click: () => this.store.splitStack(single!.id) },
      { type: 'separator' },
      { label: 'Remove from Shelf', enabled: anyUnlocked, click: () => this.store.remove(ids) },
    );
    return Menu.buildFromTemplate(template);
  }

  // ---- clipboard history -------------------------------------------------

  private async snapshotToContent(): Promise<ClipContent | null> {
    // History never records what password managers mark as secret.
    const snap = await readClipboard({ skipPrivate: true });
    if (!snap) return null;
    if (snap.kind !== 'image') return snap;
    const signature = createHash('sha1').update(snap.png).digest('hex');
    const imagePath = join(this.clipImagesDir, `${signature}.png`);
    if (!existsSync(imagePath)) writeFileSync(imagePath, snap.png);
    return { kind: 'image', imagePath, signature };
  }

  /** Captures run one at a time so a slow read can't land after a newer one. */
  private captureClipboard(): Promise<void> {
    this.captureChain = this.captureChain.then(async () => {
      const session = this.clipSession;
      if (!this.settings.get().clipboardHistory) return;
      const content = await this.snapshotToContent();
      if (session !== this.clipSession || !this.settings.get().clipboardHistory) return;
      this.latestClip = content;
      this.history.poll();
    }).catch((err) => console.error('Clipboard capture failed', err));
    return this.captureChain;
  }

  private async startClipboardHistory(): Promise<void> {
    this.latestClip = await this.snapshotToContent();
    this.history.prime();
    // The macOS pasteboard watcher reports copies; without it (Windows, or no addon) poll.
    if (!this.pasteboard && !this.clipTimer) this.clipTimer = setInterval(() => void this.captureClipboard(), 1000);
  }

  private stopClipboardHistory(): void {
    this.clipSession++;
    if (this.clipTimer) clearInterval(this.clipTimer);
    this.clipTimer = null;
  }

  private discardClipImage(entry: ClipEntry): void {
    const path = entry.imagePath;
    if (!path || !path.startsWith(this.clipImagesDir + sep)) return;
    if (!this.history.entries().some((e) => e.imagePath === path)) rmSync(path, { force: true });
  }

  private cleanupClipImages(): void {
    const used = new Set(this.history.entries().map((e) => e.imagePath).filter(Boolean));
    for (const name of readdirSync(this.clipImagesDir)) {
      const p = join(this.clipImagesDir, name);
      if (!used.has(p)) rmSync(p, { force: true });
    }
  }

  private async clipViews(): Promise<ClipEntryView[]> {
    return Promise.all(
      this.history.entries().map(async (e) => {
        const thumbPath = e.imagePath ?? (e.files?.[0] && isImagePath(e.files[0]) ? e.files[0] : null);
        const thumb = thumbPath ? await thumbnailFor(thumbPath) : null;
        return { id: e.id, kind: e.kind, preview: e.preview, createdAt: e.createdAt, pinned: e.pinned, thumb: thumb?.toDataURL() ?? null };
      }),
    );
  }

  private readonly broadcastClips = latestOnly(
    () => this.clipViews(),
    (views) => {
      if (this.clipWin && !this.clipWin.isDestroyed()) this.clipWin.webContents.send('clip:entries', views);
    },
  );

  private async copyClip(id: string): Promise<void> {
    const e = this.history.entries().find((x) => x.id === id);
    if (!e) return;
    if (e.kind === 'files' && e.files) await copyFiles(e.files);
    else if (e.kind === 'image' && e.imagePath) await writeClipboardImage(e.imagePath);
    else if (e.text !== undefined) await writeClipboardText(e.text);
  }

  private clipToShelf(id: string): void {
    const e = this.history.entries().find((x) => x.id === id);
    if (!e) return;
    if (e.kind === 'files' && e.files) this.contentToShelf({ kind: 'files', files: e.files });
    else if (e.kind === 'image' && e.imagePath && existsSync(e.imagePath)) this.contentToShelf({ kind: 'image', png: readFileSync(e.imagePath) });
    else if (e.text !== undefined) this.contentToShelf({ kind: 'text', text: e.text });
  }

  private async clipboardToShelf(): Promise<void> {
    const snap = await readClipboard();
    if (snap) this.contentToShelf(snap);
  }

  /** Single place that turns clipboard content into shelf items. */
  private contentToShelf(content: ClipboardSnapshot): void {
    if (content.kind === 'files') this.addExternalPaths(content.files);
    else if (content.kind === 'image') this.addSnippets([{ kind: 'image', data: content.png, mime: 'image/png' }]);
    else if (isWebLink(content.text)) this.addSnippets([{ kind: 'url', url: content.text.trim() }]);
    else if (content.text.trim()) this.addSnippets([{ kind: 'text', text: content.text }]);
    if (!this.shelf.visible) this.showShelf();
  }

  // ---- windows ----------------------------------------------------------

  private openAuxWindow(existing: BrowserWindow | null, page: string, title: string, width: number, height: number): BrowserWindow {
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return existing;
    }
    const win = new BrowserWindow({
      width,
      height,
      title,
      show: false,
      autoHideMenuBar: true,
      resizable: true,
      webPreferences: { preload: join(__dirname, '../preload/preload.js'), contextIsolation: true, sandbox: true },
    });
    void win.loadFile(join(__dirname, `../renderer/${page}`));
    win.once('ready-to-show', () => {
      if (isMac) app.focus({ steal: true });
      win.show();
    });
    return win;
  }

  private openSettingsWindow(): void {
    this.settingsWin = this.openAuxWindow(this.settingsWin, 'settings.html', 'Droper Settings', 460, 560);
  }

  private openClipboardWindow(): void {
    this.clipWin = this.openAuxWindow(this.clipWin, 'clipboard.html', 'Clipboard History', 420, 600);
  }

  // ---- settings, permissions, integration --------------------------------

  private sendAppearance(): void {
    this.shelf.send('shelf:appearance', { iconSize: this.settings.get().iconSize });
  }

  private applySettings(keys: (keyof Settings)[]): void {
    const s = this.settings.get();
    if (keys.includes('shelfWidth') || keys.includes('shelfHeight')) {
      this.shelf.setSize(s.shelfWidth, s.shelfHeight);
      this.preview.hide();
    }
    if (keys.includes('iconSize')) this.sendAppearance();
    if (keys.includes('trigger')) this.watcher.setMode(s.trigger);
    if (keys.includes('hotkey')) {
      globalShortcut.unregisterAll();
      if (s.hotkey) {
        try {
          globalShortcut.register(s.hotkey, () => this.toggleShelf());
        } catch (err) {
          console.error('Invalid hotkey', s.hotkey, err);
        }
      }
    }
    if (keys.includes('launchAtLogin') && app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.launchAtLogin });
    if (keys.includes('clipboardLimit')) this.history.setLimit(s.clipboardLimit);
    if (keys.includes('clipboardHistory')) {
      if (s.clipboardHistory) void this.startClipboardHistory();
      else {
        this.stopClipboardHistory();
        this.history.clear({ includePinned: true });
        this.cleanupClipImages();
      }
    }
    if (keys.includes('side') && this.shelf.visible) this.shelf.showAt(s.side, screen.getCursorScreenPoint());
    this.refreshTrayMenu();
  }

  private requestAccessibility(): void {
    systemPreferences.isTrustedAccessibilityClient(true);
  }

  /** The global mouse hook needs Accessibility permission on macOS; wait for it instead of failing. */
  private startHookWhenPermitted(): void {
    const tryStart = () => {
      if (this.hookRunning) return true;
      if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) return false;
      try {
        this.watcher.start();
        this.hookRunning = true;
        this.refreshTrayMenu();
      } catch (err) {
        console.error('Global mouse hook failed to start', err);
      }
      return this.hookRunning;
    };
    if (tryStart()) return;
    this.requestAccessibility();
    const timer = setInterval(() => {
      if (tryStart()) clearInterval(timer);
    }, 3000);
  }

  /** Adds Droper to Explorer's "Send to" menu. */
  private installSendTo(): void {
    if (!isWin || !app.isPackaged) return;
    const link = join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', 'Droper.lnk');
    if (!existsSync(link)) shell.writeShortcutLink(link, 'create', { target: process.execPath, description: 'Add to Droper shelf' });
  }

  // ---- IPC ----------------------------------------------------------------

  /** Only the main frame of our own windows, still showing the bundled page it was opened with. */
  private isTrusted(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
    const frame = e.senderFrame;
    if (!frame || frame !== e.sender.mainFrame) return false;
    const pages: [BrowserWindow | null, string][] = [
      [this.shelf.win, 'shelf.html'],
      [this.settingsWin, 'settings.html'],
      [this.clipWin, 'clipboard.html'],
    ];
    return pages.some(
      ([w, page]) => w !== null && !w.isDestroyed() && w.webContents === e.sender && frame.url === pageUrl(page),
    );
  }

  private on(channel: string, handler: (e: IpcMainEvent, ...args: any[]) => void): void {
    ipcMain.on(channel, (e, ...args) => {
      if (this.isTrusted(e)) handler(e, ...args);
    });
  }

  private handle(channel: string, handler: (e: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
    ipcMain.handle(channel, (e, ...args) => (this.isTrusted(e) ? handler(e, ...args) : null));
  }

  private registerIpc(): void {
    const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

    this.handle('shelf:list', () => this.itemViews());
    this.on('shelf:addFiles', (_e, paths) => this.addExternalPaths(ids(paths)));
    this.on('shelf:addSnippets', (_e, raw) => {
      if (!Array.isArray(raw)) return;
      this.addSnippets(raw.map(validSnippet).filter((p): p is SnippetPayload => p !== null));
    });
    this.on('shelf:startDrag', (e, raw) => {
      const sel = ids(raw);
      const paths = this.store.pathsFor(sel).filter((p) => existsSync(p));
      if (paths.length) this.startDragOut(sel, paths, e.sender);
    });
    this.on('shelf:contextMenu', (e, raw) => {
      const sel = ids(raw);
      if (sel.length) this.itemMenu(sel, e.sender).popup({ window: this.shelf.win });
    });
    this.on('shelf:open', (_e, raw) => this.store.pathsFor(ids(raw)).forEach((p) => void shell.openPath(p)));
    this.on('shelf:quickLook', (_e, raw) => this.toggleQuickLook(ids(raw)));
    this.on('shelf:previewFollow', (_e, raw) => this.followPreview(ids(raw)));
    this.on('shelf:closePreview', () => this.preview.hide());
    this.on('shelf:remove', (_e, raw) => this.store.remove(ids(raw)));
    this.handle('shelf:rename', (_e, id, name) => (typeof id === 'string' && typeof name === 'string' ? this.renameItem(id, name) : null));
    this.on('shelf:move', (_e, raw, to) => {
      if (Number.isInteger(to)) this.store.move(ids(raw), to);
    });
    this.on('shelf:hide', () => this.shelf.hide());
    this.on('shelf:menu', () => Menu.buildFromTemplate(this.trayTemplate()).popup({ window: this.shelf.win }));

    this.handle('clip:list', () => this.clipViews());
    this.on('clip:copy', (_e, id) => typeof id === 'string' && void this.copyClip(id));
    this.on('clip:toShelf', (_e, id) => typeof id === 'string' && this.clipToShelf(id));
    this.on('clip:pin', (_e, id, pinned) => typeof id === 'string' && this.history.setPinned(id, pinned === true));
    this.on('clip:remove', (_e, id) => typeof id === 'string' && this.history.remove(id));
    this.on('clip:clear', () => this.history.clear());

    this.handle('settings:get', () => this.settings.get());
    this.handle('settings:update', (_e, patch) => (patch && typeof patch === 'object' ? this.settings.update(patch) : this.settings.get()));
    this.handle('settings:accessibility', () => !isMac || systemPreferences.isTrustedAccessibilityClient(false));
    this.on('settings:requestAccessibility', () => this.requestAccessibility());
    this.handle('settings:recentSources', () => this.recentSources);
  }
}

function pageUrl(page: string): string {
  return pathToFileURL(join(__dirname, '../renderer', page)).href;
}

function validSnippet(raw: unknown): SnippetPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'text' && typeof r.text === 'string' && r.text.length <= MAX_SNIPPET_BYTES) return { kind: 'text', text: r.text };
  if (r.kind === 'url' && typeof r.url === 'string' && r.url.length < 8192) {
    return { kind: 'url', url: r.url, title: typeof r.title === 'string' ? r.title : undefined };
  }
  if (r.kind === 'image' && r.data instanceof Uint8Array && r.data.byteLength <= MAX_SNIPPET_BYTES && typeof r.mime === 'string' && r.mime.startsWith('image/')) {
    return { kind: 'image', data: r.data, mime: r.mime, fileName: typeof r.fileName === 'string' ? basename(r.fileName) : undefined };
  }
  return null;
}
