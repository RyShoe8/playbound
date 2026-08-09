const os = require("os");
const path = require("path");
const fs = require("fs");
const { app, shell } = require("electron");

module.exports = {
  getOS() {
    return "macos";
  },
  getOSVersion() {
    return os.release();
  },
  getArchitecture() {
    return os.arch();
  },
  getExecutableExtension() {
    return ".app";
  },
  getInstallDirectory(slug) {
    // Match Windows layout so settings / docs / users share one mental model.
    return path.join(app.getPath("home"), "PlayBound", "Games", slug || "");
  },
  getDownloadsDirectory() {
    return path.join(app.getPath("home"), "PlayBound", "Downloads");
  },
  getTempDirectory() {
    return path.join(app.getPath("temp"), "PlayBound");
  },
  async openFolder(folderPath) {
    await shell.openPath(folderPath);
  },
  async openFile(filePath) {
    await shell.openPath(filePath);
  },
  fileExists(filePath) {
    return fs.existsSync(filePath);
  },
  async createShortcut() {
    throw new Error("Desktop shortcuts are not used on macOS — pin PlayBound to the Dock instead.");
  },
  async removeShortcut() {
    // No-op for mac
  },
  supportsDesktopShortcuts() {
    return false;
  },
  supportsStartMenuShortcuts() {
    return false;
  },
  supportsDock() {
    return true;
  },
  killProcess(pid) {
    process.kill(pid);
  },
  getGameLaunchCommand(exePath) {
    // Prefer `open App.app` for bundles (more reliable than `open -a` with a path).
    if (String(exePath).endsWith(".app")) {
      return ["open", exePath];
    }
    if (String(exePath).toLowerCase().endsWith(".jar")) {
      return ["java", "-jar", exePath];
    }
    return [exePath];
  },
};
