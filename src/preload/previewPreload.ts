import { contextBridge, ipcRenderer } from 'electron';
import type { PreviewApi } from '../shared/api';

// The preview page only ever receives data; it gets no way to call back into the main process.
const api: PreviewApi = {
  onShow: (cb) => { ipcRenderer.on('preview:show', (_e, payload) => cb(payload)); },
};

contextBridge.exposeInMainWorld('droperPreview', api);
