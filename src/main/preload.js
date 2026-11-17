// LimpiaPc-MX — puente seguro entre la interfaz y el sistema
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

let seq = 0;
contextBridge.exposeInMainWorld('lpc', {
  /** Llama a una función del proceso principal. onProgress opcional. */
  call(name, ...args) {
    let onProgress = null;
    if (typeof args[args.length - 1] === 'function') onProgress = args.pop();
    const token = Date.now().toString(36) + (seq++);
    const ch = 'progress:' + token;
    const listener = (_e, d) => onProgress && onProgress(d);
    if (onProgress) ipcRenderer.on(ch, listener);
    return ipcRenderer.invoke('call', name, token, ...args).finally(() => ipcRenderer.removeListener(ch, listener));
  },
  on(channel, cb) {
    const ok = ['health:tick', 'notifications:new', 'navigate'];
    if (!ok.includes(channel)) return () => {};
    const l = (_e, d) => cb(d);
    ipcRenderer.on(channel, l);
    return () => ipcRenderer.removeListener(channel, l);
  },
  pathForFile(file) { try { return webUtils.getPathForFile(file); } catch { return file.path; } },
  platform: process.platform,
});
