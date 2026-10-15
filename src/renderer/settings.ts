import type { SettingsView } from '../shared/api';

const api = window.droper;
const field = <T extends HTMLElement>(id: keyof SettingsView) => document.getElementById(id) as T;

const selects = ['trigger', 'side'] as const;
const checks = ['removeAfterDragOut', 'autoHide', 'clipboardHistory', 'launchAtLogin'] as const;

function fill(s: SettingsView): void {
  for (const k of selects) field<HTMLSelectElement>(k).value = s[k];
  for (const k of checks) field<HTMLInputElement>(k).checked = s[k];
  field<HTMLInputElement>('hotkey').value = s.hotkey;
  field<HTMLInputElement>('clipboardLimit').value = String(s.clipboardLimit);
}

async function save(patch: Partial<SettingsView>): Promise<void> {
  fill(await api.settings.update(patch));
}

for (const k of selects) field<HTMLSelectElement>(k).addEventListener('change', (e) => void save({ [k]: (e.target as HTMLSelectElement).value }));
for (const k of checks) field<HTMLInputElement>(k).addEventListener('change', (e) => void save({ [k]: (e.target as HTMLInputElement).checked }));
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
