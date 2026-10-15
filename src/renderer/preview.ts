import type { PreviewApi, PreviewPayload } from '../shared/api';

declare global {
  interface Window {
    droperPreview: PreviewApi;
  }
}

const nameEl = document.getElementById('name')!;
const infoEl = document.getElementById('info')!;
const content = document.getElementById('content')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

function show(p: PreviewPayload): void {
  nameEl.textContent = p.name;
  nameEl.title = p.name;
  infoEl.textContent = p.info;
  content.className = `content ${p.kind}`;
  switch (p.kind) {
    case 'image':
      content.replaceChildren(el('img', { className: 'media', src: p.src!, alt: '' }));
      break;
    case 'video':
      content.replaceChildren(el('video', { src: p.src!, controls: true, autoplay: true, muted: true, loop: true }));
      break;
    case 'audio':
      content.replaceChildren(el('audio', { src: p.src!, controls: true }));
      break;
    case 'pdf':
      content.replaceChildren(el('iframe', { src: p.src! }));
      break;
    case 'text': {
      const pre = el('pre', { textContent: p.text ?? '' });
      if (p.truncated) pre.append(el('span', { className: 'cut', textContent: '… only the beginning of the file is shown' }));
      content.replaceChildren(pre);
      break;
    }
    case 'stack': {
      const grid = el('div', { className: 'grid' });
      for (const e of p.entries ?? []) {
        const cell = el('div', { className: 'cell' });
        if (e.thumb) cell.append(el('img', { src: e.thumb, alt: '' }));
        cell.append(el('span', { textContent: e.name }));
        grid.append(cell);
      }
      content.replaceChildren(grid);
      break;
    }
    default:
      content.replaceChildren(p.thumb ? el('img', { className: 'big', src: p.thumb, alt: '' }) : el('div', { className: 'empty', textContent: 'No preview' }));
  }
}

window.droperPreview.onShow(show);
