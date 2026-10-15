import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DroperApi } from '../shared/api';

const api: DroperApi = {
  platform: process.platform,
  shelf: {
    list: () => ipcRenderer.invoke('shelf:list'),
    onItems: (cb) => { ipcRenderer.on('shelf:items', (_e, items) => cb(items)); },
    onBeginRename: (cb) => { ipcRenderer.on('shelf:beginRename', (_e, id) => cb(id)); },
    addFiles: (paths) => ipcRenderer.send('shelf:addFiles', paths),
    addSnippets: (snippets) => ipcRenderer.send('shelf:addSnippets', snippets),
    pathForFile: (file) => webUtils.getPathForFile(file),
    startDrag: (ids) => ipcRenderer.send('shelf:startDrag', ids),
    contextMenu: (ids) => ipcRenderer.send('shelf:contextMenu', ids),
    open: (ids) => ipcRenderer.send('shelf:open', ids),
    quickLook: (ids) => ipcRenderer.send('shelf:quickLook', ids),
    remove: (ids) => ipcRenderer.send('shelf:remove', ids),
    rename: (id, name) => ipcRenderer.invoke('shelf:rename', id, name),
    move: (ids, toIndex) => ipcRenderer.send('shelf:move', ids, toIndex),
    hide: () => ipcRenderer.send('shelf:hide'),
    menu: () => ipcRenderer.send('shelf:menu'),
  },
  clipboard: {
    list: () => ipcRenderer.invoke('clip:list'),
    onEntries: (cb) => { ipcRenderer.on('clip:entries', (_e, entries) => cb(entries)); },
    copy: (id) => ipcRenderer.send('clip:copy', id),
    toShelf: (id) => ipcRenderer.send('clip:toShelf', id),
    pin: (id, pinned) => ipcRenderer.send('clip:pin', id, pinned),
    remove: (id) => ipcRenderer.send('clip:remove', id),
    clear: () => ipcRenderer.send('clip:clear'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    accessibilityStatus: () => ipcRenderer.invoke('settings:accessibility'),
    requestAccessibility: () => ipcRenderer.send('settings:requestAccessibility'),
  },
};

contextBridge.exposeInMainWorld('droper', api);
