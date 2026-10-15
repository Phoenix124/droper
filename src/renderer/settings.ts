import type { AppView, SettingsView } from '../shared/api';

const api = window.droper;
const field = <T extends HTMLElement>(id: keyof SettingsView) => document.getElementById(id) as T;

const selects = ['trigger', 'side', 'iconSize'] as const;
const ranges = ['shelfWidth', 'shelfHeight'] as const;
let current: SettingsView | null = null;
const checks = ['removeAfterDragOut', 'autoHide', 'clipboardHistory', 'launchAtLogin', 'confirmUrlActions', 'addScreenshots', 'checkForUpdates'] as const;

function fill(s: SettingsView): void {
  current = s;
  for (const k of selects) field<HTMLSelectElement>(k).value = s[k];
  for (const k of ranges) {
    field<HTMLInputElement>(k).value = String(s[k]);
    document.getElementById(`${k}-value`)!.textContent = `${s[k]} px`;
  }
  renderIgnored(s.ignoredApps);
  for (const k of checks) field<HTMLInputElement>(k).checked = s[k];
  field<HTMLInputElement>('hotkey').value = s.hotkey;
  field<HTMLInputElement>('clipboardLimit').value = String(s.clipboardLimit);
}

async function save(patch: Partial<SettingsView>): Promise<void> {
  fill(await api.settings.update(patch));
}

for (const k of selects) field<HTMLSelectElement>(k).addEventListener('change', (e) => void save({ [k]: (e.target as HTMLSelectElement).value }));
for (const k of checks) field<HTMLInputElement>(k).addEventListener('change', (e) => void save({ [k]: (e.target as HTMLInputElement).checked }));
for (const k of ranges) {
  const input = field<HTMLInputElement>(k);
  // Live label while dragging the slider, save on release.
  input.addEventListener('input', () => (document.getElementById(`${k}-value`)!.textContent = `${input.value} px`));
  input.addEventListener('change', () => void save({ [k]: Number(input.value) }));
}
field<HTMLInputElement>('hotkey').addEventListener('change', (e) => void save({ hotkey: (e.target as HTMLInputElement).value.trim() }));
field<HTMLInputElement>('clipboardLimit').addEventListener('change', (e) => void save({ clipboardLimit: Number((e.target as HTMLInputElement).value) }));

const ax = document.getElementById('ax')!;
document.getElementById('ax-btn')!.addEventListener('click', () => api.settings.requestAccessibility());
async function checkAccessibility(): Promise<void> {
  ax.classList.toggle('show', !(await api.settings.accessibilityStatus()));
}

void api.settings.get().then(fill);
void checkAccessibility();
window.addEventListener('focus', () => void checkAccessibility());

// ---- ignored apps ----------------------------------------------------------------

const ignoredList = document.getElementById('ignored')!;
const ignoreInput = document.getElementById('ignore-input') as HTMLInputElement;
const recentWrap = document.getElementById('recent-wrap')!;
const recent = document.getElementById('recent')!;

function renderIgnored(list: string[]): void {
  ignoredList.replaceChildren(
    ...list.map((entry) => {
      const li = document.createElement('li');
      li.textContent = entry;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = `Stop ignoring ${entry}`;
      del.addEventListener('click', () => void save({ ignoredApps: list.filter((x) => x !== entry) }));
      li.append(del);
      return li;
    }),
  );
}

function addIgnored(entry: string): void {
  const value = entry.trim();
  if (!value || !current) return;
  void save({ ignoredApps: [...current.ignoredApps, value] }).then(renderRecent);
}

document.getElementById('ignore-add')!.addEventListener('click', () => {
  addIgnored(ignoreInput.value);
  ignoreInput.value = '';
});
ignoreInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addIgnored(ignoreInput.value);
    ignoreInput.value = '';
  }
});

function appKey(a: AppView): string {
  return a.id || a.exe || a.name;
}

async function renderRecent(): Promise<void> {
  const apps = await api.settings.recentSources();
  const ignored = new Set((current?.ignoredApps ?? []).map((x) => x.toLowerCase()));
  const offer = apps.filter((a) => ![a.id, a.name, a.exe].some((k) => k && ignored.has(k.toLowerCase())));
  recentWrap.style.display = offer.length ? '' : 'none';
  recent.replaceChildren(
    ...offer.map((a) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = `+ ${a.name || appKey(a)}`;
      b.title = `Ignore drags from ${appKey(a)}`;
      b.addEventListener('click', () => addIgnored(appKey(a)));
      return b;
    }),
  );
}

void renderRecent();
window.addEventListener('focus', () => void renderRecent());
