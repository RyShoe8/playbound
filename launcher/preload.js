const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("playbound", {
  catalog: () => ipcRenderer.invoke("catalog"),
  install: (slug) => ipcRenderer.invoke("install", slug),
  play: (slug) => ipcRenderer.invoke("play", slug),
  uninstall: (slug) => ipcRenderer.invoke("uninstall", slug),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  onProgress: (cb) => ipcRenderer.on("progress", (_event, data) => cb(data)),
});
