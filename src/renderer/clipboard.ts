import type { ClipEntryView } from '../shared/api';

const api = window.droper;
const list = document.getElementById('list')!;
const empty = document.getElementById('empty')!;
const search = document.getElementById('search') as HTMLInputElement;
const ICONS: Record<ClipEntryView['kind'], string> = { text: '¶', link: '🔗', files: '📄', image: '🖼' };

let entries: ClipEntryView[] = [];
let filter = 'all';

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

function button(label: string, title: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title;
  b.className = cls;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function render(): void {
  const q = search.value.trim().toLowerCase();
  const shown = entries.filter(
    (e) => (filter === 'all' || (filter === 'pinned' ? e.pinned : e.kind === filter)) && (!q || e.preview.toLowerCase().includes(q)),
  );
  empty.classList.toggle('show', shown.length === 0);
  list.replaceChildren(
    ...shown.map((e) => {
      const li = document.createElement('li');
      li.className = `clip${e.pinned ? ' pinned' : ''}`;
      li.title = 'Click to copy';
      if (e.thumb) {
        const img = document.createElement('img');
        img.src = e.thumb;
        img.alt = '';
        li.append(img);
      } else {
        const k = document.createElement('span');
        k.className = 'kind';
        k.textContent = ICONS[e.kind];
        li.append(k);
      }
      const body = document.createElement('div');
      body.className = 'body';
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = e.preview;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = ago(e.createdAt);
      body.append(text, meta);
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(
        button('⇩', 'Add to shelf', 'shelf', () => api.clipboard.toShelf(e.id)),
        button('📌', e.pinned ? 'Unpin' : 'Pin', 'pin', () => api.clipboard.pin(e.id, !e.pinned)),
        button('✕', 'Delete', 'del', () => api.clipboard.remove(e.id)),
      );
      li.append(body, actions);
      li.addEventListener('click', () => {
        api.clipboard.copy(e.id);
        meta.textContent = 'Copied';
      });
      return li;
    }),
  );
}

document.getElementById('filters')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b?.dataset.f) return;
  filter = b.dataset.f;
  document.querySelectorAll('#filters button').forEach((x) => x.classList.toggle('on', x === b));
  render();
});
search.addEventListener('input', render);
document.getElementById('clear')!.addEventListener('click', () => {
  if (confirm('Clear clipboard history? Pinned entries are kept.')) api.clipboard.clear();
});

api.clipboard.onEntries((next) => {
  entries = next;
  render();
});
void api.clipboard.list().then((initial) => {
  entries = initial;
  render();
});
