const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("playbound", {
  getContext: () => ipcRenderer.invoke("get-context"),
  chooseDirectory: (defaultPath) => ipcRenderer.invoke("choose-directory", defaultPath),
  install: (slug, targetDir) => ipcRenderer.invoke("install", slug, targetDir),
  play: (slug) => ipcRenderer.invoke("play", slug),
  uninstall: (slug) => ipcRenderer.invoke("uninstall", slug),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  onContext: (cb) => ipcRenderer.on("context", (_event, data) => cb(data)),
  onProgress: (cb) => ipcRenderer.on("progress", (_event, data) => cb(data)),
});
