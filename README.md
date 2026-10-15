# Droper

**English** · [Русский](README.ru.md)

A cross-platform (macOS + Windows) drag & drop shelf. Start dragging a file and a shelf slides in at the edge of the screen. Drop it there, switch windows, Spaces or full-screen apps at your own pace, then drag it out wherever it needs to go.

Built with Electron + TypeScript; a global mouse hook via `uiohook-napi` detects drags.

## Features

| | |
|---|---|
| Shelf trigger | when a drag starts, when you drag to the screen edge, at the mouse pointer, or only via shortcut/menu |
| Accepts | files and folders (kept as references, never copied), text → `.txt`, links → `.webloc`/`.url`, images from browsers → image files |
| Drag out | one item, several, or a whole stack; dragged-out items leave the shelf (configurable), locked items stay |
| Stacks | merge a selection into a stack, split it back |
| Preview | Space opens a popover next to the shelf: images, PDF, text, video/audio, Quick Look thumbnails for other files (macOS), folders, stack grid; arrows step through items, Esc closes |
| Search | ⌘F / Ctrl+F or the 🔍 button filters by name and path; every word must match |
| Context menu | Open, Quick Look, Show in Finder/Explorer, Copy / Copy Path, Share (macOS), Rename, Lock, Merge/Split, Remove |
| Keyboard | Space preview, Enter open, Delete remove, ⌘/Ctrl+A, ⌘/Ctrl+F, arrows; Esc closes preview → search → shelf |
| Undo | "Restore Removed Items" brings back the last removed batch |
| Clipboard history | optional: text, links, images, files; pin, search, filters, send to shelf |
| Integration | tray / menu bar, global shortcut (`CommandOrControl+Shift+Y`), launch at login, Explorer "Send to → Droper", Open With / drop on the app icon |
| Auto cleanup | files deleted or moved to the Trash disappear from the shelf |

## Development

```bash
npm install
npm test          # core unit tests (vitest)
npm start         # build + run
```

On macOS, grant **Accessibility** on first launch (System Settings → Privacy & Security → Accessibility). In development the permission belongs to `Electron.app` / your terminal. Without it the shelf still works, but it won't appear on its own when you drag — only via the shortcut or menu.

## Building

```bash
npm run dist:mac  # release/Droper-<ver>-arm64.dmg
npm run dist:win  # release/Droper Setup <ver>.exe (x64 + arm64), can be built on macOS too
```

GitHub Actions (`.github/workflows/build.yml`) builds both on `v*` tags. Builds are not signed or notarized; public distribution needs an Apple Developer ID and a Windows code-signing certificate.

## Architecture

```
src/core/      pure logic without Electron, covered by tests
  shelfStore       items, stacks, lock, remove/restore, prune
  dragDetector     state machine: mouse down/move/up → "show the shelf"
  ingest           saves dropped text/links/images as files
  clipboardHistory clipboard history
  settings         validated settings
  preview          preview kind and popover placement
src/main/      Electron main: panel windows, tray, IPC, mouse hook, clipboard
src/preload/   contextBridge APIs
src/renderer/  shelf, preview, settings and clipboard history UI (vanilla TS)
```

Telling a real drag apart from selecting text or moving a window:
- **macOS**: a background JXA process watches the `changeCount` of the system drag pasteboard; the shelf only appears when some app actually started a drag session.
- **Windows**: there is no equivalent, so the default trigger is "drag to the screen edge"; false positives are absorbed by auto-hiding an empty shelf.

## Limitations

- No Handoff/iCloud, macOS Services menu, widgets or Shortcuts actions.
- The preview is custom (not the system QLPreviewPanel): formats without a thumbnail generator show their icon.
- Windows: "Copy" puts paths as text (Electron can't write CF_HDROP). Reading several copied files goes through `text/uri-list` (verified on macOS, not yet on Windows).
- Drag-out uses a small native addon (`native/`: NSDraggingSession on macOS, SHDoDragDrop on Windows) that reports whether the drop target accepted the files, so cancelled or refused drops keep items on the shelf. If the addon isn't built, Droper falls back to judging by where the mouse was released.
