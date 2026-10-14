'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('picker', {
  send: (kind, value) => ipcRenderer.send('picker', kind, value),
  onStatus: (cb) => ipcRenderer.on('picker:status', (_e, d) => cb(d)),
});
