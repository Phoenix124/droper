import type { DroppedSnippet, ItemView } from '../shared/api';
import { filterItems } from './filter.js';
import { rangeSelection } from './selection.js';

const api = window.droper;
const panel = document.getElementById('panel')!;
const list = document.getElementById('items') as HTMLUListElement;
const count = document.getElementById('count')!;
const searchRow = document.getElementById('search-row')!;
const search = document.getElementById('search') as HTMLInputElement;

let items: ItemView[] = [];
/** Items currently visible (after the search filter). */
let shown: ItemView[] = [];
let query = '';
let previewOpen = false;
const selected = new Set<string>();
let anchor: string | null = null;
let renaming: string | null = null;

// ---- rendering ---------------------------------------------------------------

function render(): void {
  shown = filterItems(items, query);
  // Hidden items must not stay selected, or keyboard actions would hit things the user can't see.
  for (const id of [...selected]) if (!shown.some((i) => i.id === id)) selected.delete(id);
  if (anchor && !shown.some((i) => i.id === anchor)) anchor = null;
  panel.classList.toggle('is-empty', items.length === 0);
  panel.classList.toggle('no-matches', items.length > 0 && shown.length === 0);
  const files = items.reduce((n, i) => n + i.count, 0);
  if (query) count.textContent = `${shown.length} of ${items.length}`;
  else count.textContent = items.length ? `${files} ${files === 1 ? 'item' : 'items'}` : '';

  list.replaceChildren(
    ...shown.map((item) => {
      const li = document.createElement('li');
      li.className = `item ${item.kind}`;
      li.classList.toggle('selected', selected.has(item.id));
      li.dataset.id = item.id;
      li.draggable = true;
      li.title = item.paths.join('\n');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(selected.has(item.id)));

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (item.thumb) {
        const img = document.createElement('img');
        img.src = item.thumb;
        img.alt = '';
        img.draggable = false;
        thumb.append(img);
      }
      if (item.kind === 'stack') {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = String(item.count);
        thumb.append(badge);
      }
      li.append(thumb);

      if (item.locked) {
        const lock = document.createElement('span');
        lock.className = 'lock';
        lock.textContent = '🔒';
        lock.title = 'Locked: stays on the shelf after dragging out';
        li.append(lock);
      }

      if (renaming === item.id) li.append(renameInput(item));
      else {
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = item.name;
        li.append(name);
      }
      return li;
    }),
  );
  list.querySelector<HTMLInputElement>('.rename')?.focus();
}

function renameInput(item: ItemView): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'rename';
  input.value = item.name;
  input.draggable = false;
  const dot = item.name.lastIndexOf('.');
  queueMicrotask(() => input.setSelectionRange(0, dot > 0 ? dot : item.name.length));
  const finish = async (commit: boolean) => {
    if (renaming !== item.id) return;
    if (commit && input.value !== item.name) {
      const result = await api.shelf.rename(item.id, input.value);
      if (result === null) {
        input.classList.remove('error');
        void input.offsetWidth;
        input.classList.add('error');
        return;
      }
    }
    renaming = null;
    render();
    list.focus();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') void finish(true);
    if (e.key === 'Escape') void finish(false);
  });
  input.addEventListener('blur', () => void finish(true));
  return input;
}

// ---- selection ---------------------------------------------------------------

function itemIdFrom(target: EventTarget | null): string | null {
  return (target as HTMLElement | null)?.closest<HTMLElement>('.item')?.dataset.id ?? null;
}

function select(id: string, e: MouseEvent | KeyboardEvent): void {
  const toggle = api.platform === 'darwin' ? e.metaKey : e.ctrlKey;
  if (e.shiftKey) {
    const range = rangeSelection(shown.map((i) => i.id), anchor, id);
    selected.clear();
    range.forEach((x) => selected.add(x));
    if (range.length === 1) anchor = id;
  } else if (toggle) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    anchor = id;
  } else {
    selected.clear();
    selected.add(id);
    anchor = id;
  }
  render();
  followPreview();
}

function selection(): string[] {
  return shown.filter((i) => selected.has(i.id)).map((i) => i.id);
}

function followPreview(): void {
  const sel = selection();
  if (previewOpen && sel.length) api.shelf.previewFollow(sel);
}

// ---- search ---------------------------------------------------------------------

function openSearch(): void {
  searchRow.classList.add('open');
  search.focus();
  search.select();
}

function closeSearch(): void {
  query = '';
  search.value = '';
  searchRow.classList.remove('open');
  render();
  list.focus();
}

search.addEventListener('input', () => {
  query = search.value;
  render();
});

search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeSearch();
  } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (shown[0]) {
      list.focus();
      select(shown[0].id, e);
    }
  }
});

list.addEventListener('mousedown', (e) => {
  const id = itemIdFrom(e.target);
  if (!id) {
    selected.clear();
    render();
    return;
  }
  // Keep a multi-selection intact when starting to drag one of its items.
  if (selected.has(id) && !e.shiftKey && !e.metaKey && !e.ctrlKey) return;
  select(id, e);
});

list.addEventListener('click', (e) => {
  const id = itemIdFrom(e.target);
  if (id && selected.size > 1 && !e.shiftKey && !e.metaKey && !e.ctrlKey) select(id, e);
});

list.addEventListener('dblclick', (e) => {
  const id = itemIdFrom(e.target);
  if (id) api.shelf.open([id]);
});

list.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const id = itemIdFrom(e.target);
  if (!id) return;
  if (!selected.has(id)) select(id, e);
  api.shelf.contextMenu(selection());
});

document.addEventListener('keydown', (e) => {
  if (renaming || e.target === search) return;
  const sel = selection();
  const mod = api.platform === 'darwin' ? e.metaKey : e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    openSearch();
  } else if (e.key === ' ' && sel.length) {
    e.preventDefault();
    api.shelf.quickLook(sel);
  } else if (e.key === 'Enter' && sel.length) {
    api.shelf.open(sel);
  } else if ((e.key === 'Backspace' || e.key === 'Delete') && sel.length) {
    api.shelf.remove(sel);
  } else if (mod && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    shown.forEach((i) => selected.add(i.id));
    render();
  } else if (e.key === 'Escape') {
    // Peel back one layer at a time: preview, then search, then the shelf itself.
    if (previewOpen) api.shelf.closePreview();
    else if (searchRow.classList.contains('open')) closeSearch();
    else api.shelf.hide();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const idx = shown.findIndex((i) => i.id === anchor);
    const next = shown[Math.min(shown.length - 1, Math.max(0, idx + step))];
    if (next) select(next.id, e);
  }
});

// ---- drag out ----------------------------------------------------------------

list.addEventListener('dragstart', (e) => {
  const id = itemIdFrom(e.target);
  e.preventDefault();
  if (!id) return;
  if (!selected.has(id)) {
    selected.clear();
    selected.add(id);
    render();
  }
  api.shelf.startDrag(selection());
});

// ---- drop in -------------------------------------------------------------------

let dragDepth = 0;

function dropIndex(y: number): number {
  const rows = [...list.querySelectorAll<HTMLElement>('.item')];
  const i = rows.findIndex((r) => {
    const b = r.getBoundingClientRect();
    return y < b.top + b.height / 2;
  });
  return i < 0 ? rows.length : i;
}

function markDropIndex(index: number | null): void {
  list.querySelectorAll('.drop-before').forEach((el) => el.classList.remove('drop-before'));
  if (index !== null) list.querySelectorAll('.item')[index]?.classList.add('drop-before');
}

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  panel.classList.add('drop-target');
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  markDropIndex(items.length ? dropIndex(e.clientY) : null);
});

document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    panel.classList.remove('drop-target');
    markDropIndex(null);
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  panel.classList.remove('drop-target');
  markDropIndex(null);
  const dt = e.dataTransfer;
  if (dt) void ingest(dt, dropIndex(e.clientY));
});

async function ingest(dt: DataTransfer, index: number): Promise<void> {
  const paths: string[] = [];
  const snippets: DroppedSnippet[] = [];

  for (const file of Array.from(dt.files)) {
    const path = api.shelf.pathForFile(file);
    if (path) paths.push(path);
    else if (file.type.startsWith('image/')) {
      // Images dragged from a browser have no file on disk yet.
      snippets.push({ kind: 'image', data: new Uint8Array(await file.arrayBuffer()), mime: file.type, fileName: file.name });
    }
  }

  if (!paths.length && !snippets.length) {
    const uri = dt.getData('text/uri-list').split(/\r?\n/).find((l) => l && !l.startsWith('#'));
    const text = dt.getData('text/plain');
    if (uri) snippets.push({ kind: 'url', url: uri, title: text && text !== uri ? text : undefined });
    else if (text.trim()) snippets.push({ kind: 'text', text });
  }

  if (paths.length) {
    // Dropping the shelf's own items back onto it reorders them (only meaningful when nothing is filtered out).
    const own = items.filter((i) => i.paths.every((p) => paths.includes(p)));
    const ownPaths = new Set(own.flatMap((i) => i.paths));
    if (own.length && paths.every((p) => ownPaths.has(p))) {
      if (!query) api.shelf.move(own.map((i) => i.id), index);
    } else api.shelf.addFiles(paths);
  }
  if (snippets.length) api.shelf.addSnippets(snippets);
}

// ---- wiring ----------------------------------------------------------------------

document.getElementById('menu')!.addEventListener('click', () => api.shelf.menu());
document.getElementById('close')!.addEventListener('click', () => api.shelf.hide());
document.getElementById('search-btn')!.addEventListener('click', () => {
  if (searchRow.classList.contains('open')) closeSearch();
  else openSearch();
});

api.shelf.onPreviewState((open) => {
  previewOpen = open;
});

api.shelf.onItems((next) => {
  items = next;
  render();
});

api.shelf.onBeginRename((id) => {
  renaming = id;
  render();
});

void api.shelf.list().then((initial) => {
  items = initial;
  render();
});
