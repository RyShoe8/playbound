const os = require("os");
const path = require("path");
const fs = require("fs");
const { app, shell } = require("electron");

/** Minimal Linux platform adapter — keeps non-Windows builds off the Windows impl. */
module.exports = {
  getOS() {
    return "linux";
  },
  getOSVersion() {
    return os.release();
  },
  getArchitecture() {
    return os.arch();
  },
  getExecutableExtension() {
    return "";
  },
  getInstallDirectory(slug) {
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
    throw new Error("Desktop shortcuts are not implemented on Linux yet.");
  },
  async removeShortcut() {},
  supportsDesktopShortcuts() {
    return false;
  },
  supportsStartMenuShortcuts() {
    return false;
  },
  supportsDock() {
    return false;
  },
  killProcess(pid) {
    process.kill(pid);
  },
  getGameLaunchCommand(exePath) {
    if (String(exePath).toLowerCase().endsWith(".jar")) {
      return ["java", "-jar", exePath];
    }
    return [exePath];
  },
};
