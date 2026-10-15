<div align="center">

<img src="assets/icon.png" width="128" alt="Иконка Droper">

# Droper

**Полка для drag & drop на macOS и Windows.**<br>
Начинаешь тащить, бросаешь на шелф, не торопишься, вытаскиваешь туда, куда нужно.

![macOS](https://img.shields.io/badge/macOS-11%2B-000000?logo=apple&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest&logoColor=white)

[English](README.md) · **Русский**

</div>

<table>
  <tr>
    <td align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/shelf-dark.png">
        <img src="docs/screenshots/shelf-light.png" width="132" alt="The shelf">
      </picture>
      <br><sub><b>Шелф</b></sub>
    </td>
    <td align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/preview-image-dark.png">
        <img src="docs/screenshots/preview-image-light.png" width="440" alt="Preview popover">
      </picture>
      <br><sub><b>Space — предпросмотр</b></sub>
    </td>
    <td align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/shelf-search-dark.png">
        <img src="docs/screenshots/shelf-search-light.png" width="132" alt="Search">
      </picture>
      <br><sub><b>⌘F — поиск</b></sub>
    </td>
  </tr>
</table>

## ✨ Возможности

| | |
|---|---|
| 🪄 **Появляется сам** | При начале drag, у края экрана или под курсором. На macOS реагирует только на настоящую drag-сессию, а не на выделение текста или перетаскивание окна. |
| 📦 **Принимает всё** | Файлы и папки (хранятся ссылки, ничего не копируется), текст → `.txt`, ссылки → `.webloc` / `.url`, картинки прямо из браузера. |
| 🎯 **Точный drag-out** | Нативный аддон спрашивает у ОС, принял ли получатель файлы. Отменённый или отклонённый drop оставляет элементы на месте. |
| 🗂️ **Стеки** | Объединяй элементы в стек, вытаскивай его целиком, разбивай обратно. |
| 👀 **Предпросмотр** | <kbd>Space</kbd> открывает поповер рядом с шелфом: картинки, PDF, текст, видео, аудио, Quick Look-превью, папки, стеки. |
| 🔍 **Поиск** | <kbd>⌘F</kbd> / <kbd>Ctrl+F</kbd> фильтрует по имени и пути. |
| 🔒 **Блокировка и отмена** | Заблокированные элементы остаются после drag-out. *Restore Removed Items* возвращает последнее удалённое. |
| 🙈 **Игнор-лист** | Шелф не появляется при drag из выбранных приложений; последние источники drag добавляются в один клик. |
| 📐 **Свой размер** | Ширина, высота шелфа и размер иконок, применяются сразу. |
| 📋 **История буфера** | По желанию. Текст, ссылки, картинки и файлы; закрепление, поиск, фильтры. |
| 🔗 **Автоматизация** | Ссылки `droper://` для Shortcuts, Alfred, Raycast и скриптов. |
| ⚙️ **Встраивается** | Менюбар / трей, глобальный хоткей, автозапуск, «Отправить → Droper» в Explorer. |

## ⌨️ Клавиатура

| Клавиша | Действие |
|---|---|
| <kbd>Space</kbd> | Предпросмотр выделенного (ещё раз — закрыть) |
| <kbd>↑</kbd> <kbd>↓</kbd> | Переход по элементам, предпросмотр следует |
| <kbd>⌘F</kbd> / <kbd>Ctrl+F</kbd> | Поиск по шелфу |
| <kbd>Enter</kbd> | Открыть |
| <kbd>⌫</kbd> / <kbd>Delete</kbd> | Убрать с шелфа |
| <kbd>⌘A</kbd> / <kbd>Ctrl+A</kbd> | Выделить всё |
| <kbd>Esc</kbd> | Закрыть предпросмотр → поиск → шелф |
| <kbd>⌘⇧Y</kbd> / <kbd>Ctrl+Shift+Y</kbd> | Показать или скрыть шелф откуда угодно |

## 🖼️ Ещё скриншоты

<table>
  <tr>
    <td align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/preview-text-dark.png">
        <img src="docs/screenshots/preview-text-light.png" width="360" alt="Text preview">
      </picture>
      <br><sub>Предпросмотр текста</sub>
    </td>
    <td align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/preview-stack-dark.png">
        <img src="docs/screenshots/preview-stack-light.png" width="360" alt="Stack preview">
      </picture>
      <br><sub>Предпросмотр стека</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/settings-dark.png">
        <img src="docs/screenshots/settings-light.png" width="360" alt="Settings">
      </picture>
      <br><sub>Настройки</sub>
    </td>
    <td align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/clipboard-dark.png">
        <img src="docs/screenshots/clipboard-light.png" width="360" alt="Clipboard history">
      </picture>
      <br><sub>История буфера</sub>
    </td>
  </tr>
</table>

## 💾 Установка

Свежая сборка — в [**Releases**](../../releases).

| Платформа | Файл | Первый запуск |
|---|---|---|
| 🍎 macOS (Apple Silicon) | `Droper-<версия>-arm64.dmg` | Без подписи: правый клик → **Открыть**, затем разреши **Универсальный доступ** |
| 🪟 Windows (x64 / ARM64) | `Droper-Setup-<версия>.exe` | Без подписи: SmartScreen → **Подробнее → Выполнить в любом случае** |

> [!NOTE]
> Универсальный доступ нужен, чтобы Droper видел перетаскивание мышью. Без него шелф работает, но только по хоткею или из меню.

## 🔗 Автоматизация (`droper://`)

| Ссылка | Что делает |
|---|---|
| `droper://show` · `hide` · `toggle` | Показать, скрыть или переключить шелф |
| `droper://add?path=/Users/me/a.pdf&path=/Users/me/b.png` | Добавить файлы (`path` повторяется) |
| `droper://add-text?text=Привет` | Добавить текст |
| `droper://add-url?url=https://example.com&title=Example` | Добавить ссылку |
| `droper://clear` · `restore` | Очистить шелф / вернуть последнее удалённое |

```bash
open "droper://add?path=$PWD/report.pdf"         # macOS
start "" "droper://add-text?text=Call%20Anna"   # Windows
```

<details>
<summary><b>🛠️ Разработка</b></summary>

```bash
npm install       # заодно собирает нативный аддон
npm test          # unit-тесты ядра (vitest)
npm start         # сборка + запуск
npm run dist:mac  # release/Droper-<ver>-arm64.dmg
npm run dist:win  # release/Droper-Setup-<ver>.exe (x64 + arm64)
```

Тег `v*` запускает GitHub Actions: сборка под обе платформы и draft-релиз с инсталляторами.

</details>

<details>
<summary><b>🏗️ Архитектура</b></summary>

```
src/core/      pure logic without Electron, covered by tests
  shelfStore       items, stacks, lock, remove/restore, prune
  dragDetector     mouse down/move/up → "show the shelf"
  dragOut          whether a drag-out should remove items
  ingest           dropped text/links/images → files
  clipboardHistory clipboard history
  settings         validated settings
  preview          preview kind and popover placement
  urlScheme        droper:// parsing
  ignoredApps      ignore-list matching
src/main/      Electron main: panels, tray, IPC, mouse hook, clipboard
src/preload/   contextBridge APIs
src/renderer/  shelf, preview, settings and clipboard UI (vanilla TS)
native/        N-API addon: native drag-out and app-under-pointer
```

**Как отличить настоящий drag от выделения текста или перетаскивания окна.** На macOS фоновый JXA-процесс следит за системным drag-пастбордом: шелф появляется, только когда приложение действительно начало drag-сессию. На Windows аналога нет, поэтому по умолчанию — «к краю экрана», а пустой шелф прячется сам.

**Точный drag-out.** На macOS — `NSDraggingSession` и операция из `draggingSession:endedAtPoint:operation:`. На Windows — `SHDoDragDrop` с `CF_HDROP` и учётом `CFSTR_PERFORMEDDROPEFFECT` для «оптимизированного move» Explorer'а. Без аддона используется фолбэк: решение по месту отпускания мыши.

</details>

## ⚠️ Ограничения

- 🧪 Windows-сборка проходит CI, но руками ещё не проверялась.
- ☁️ Нет Handoff / iCloud, Services-меню и виджетов.
- 📄 На Windows «Copy» кладёт пути файлов текстом.
- 🖼️ Предпросмотр свой, поэтому форматы без генератора превью показываются иконкой.
