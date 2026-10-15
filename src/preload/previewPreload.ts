import { contextBridge, ipcRenderer } from 'electron';
import type { PreviewApi } from '../shared/api';

// The preview page mostly receives data; its only call back is starting a drag of a stack member by index.
const api: PreviewApi = {
  onShow: (cb) => { ipcRenderer.on('preview:show', (_e, payload) => cb(payload)); },
  startDrag: (index) => ipcRenderer.send('preview:startDrag', index),
};

contextBridge.exposeInMainWorld('droperPreview', api);
