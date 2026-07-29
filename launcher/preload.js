const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("playbound", {
  // Existing
  getContext: () => ipcRenderer.invoke("get-context"),
  chooseDirectory: (defaultPath) => ipcRenderer.invoke("choose-directory", defaultPath),
  install: (slug, targetDir) => ipcRenderer.invoke("install", slug, targetDir),
  installMod: (slug, baseDir) => ipcRenderer.invoke("install-mod", slug, baseDir || null),
  locateExe: (slug) => ipcRenderer.invoke("locate-exe", slug),
  play: (slug, join) => ipcRenderer.invoke("play", slug, join || null),
  uninstall: (slug) => ipcRenderer.invoke("uninstall", slug),
  getInstalled: () => ipcRenderer.invoke("get-installed"),
  createShortcut: (slug) => ipcRenderer.invoke("create-shortcut", slug),
  openFolder: (dir) => ipcRenderer.invoke("open-folder", dir),
  clearContext: () => ipcRenderer.invoke("clear-context"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  openDeepLink: (url) => ipcRenderer.invoke("open-deep-link", url),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  clipboardWrite: (text) => ipcRenderer.invoke("clipboard-write", text),
  getAccount: () => ipcRenderer.invoke("get-account"),
  setLauncherToken: (token) => ipcRenderer.invoke("set-launcher-token", token),
  clearLauncherToken: () => ipcRenderer.invoke("clear-launcher-token"),
  signIn: () => ipcRenderer.invoke("sign-in"),

  // Catalog / servers / mods
  getCatalog: () => ipcRenderer.invoke("get-catalog"),
  getServers: (slug) => ipcRenderer.invoke("get-servers", slug),
  getAllServers: () => ipcRenderer.invoke("get-all-servers"),
  getServerIndex: () => ipcRenderer.invoke("get-server-index"),
  getModsCatalog: () => ipcRenderer.invoke("get-mods-catalog"),
  pingHosts: (hosts) => ipcRenderer.invoke("ping-hosts", hosts),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (patch) => ipcRenderer.invoke("save-settings", patch),
  getRecentlyPlayed: () => ipcRenderer.invoke("get-recently-played"),
  getGameDetail: (slug) => ipcRenderer.invoke("get-game-detail", slug),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("install-update"),

  // Events
  onContext: (cb) => ipcRenderer.on("context", (_event, data) => cb(data)),
  onProgress: (cb) => ipcRenderer.on("progress", (_event, data) => cb(data)),
  onAccount: (cb) => ipcRenderer.on("account", (_event, data) => cb(data || {})),
  onInstallDetected: (cb) => ipcRenderer.on("install-detected", (_event, data) => cb(data || {})),
  onModInstallFinished: (cb) =>
    ipcRenderer.on("mod-install-finished", (_event, data) => cb(data || {})),
  onUpdateStatus: (cb) => ipcRenderer.on("update-status", (_event, data) => cb(data || {})),
});
