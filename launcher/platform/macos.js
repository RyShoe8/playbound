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
    // macOS apps are typically installed to /Applications or ~/Applications
    // For sandboxed user apps without admin, ~/Applications is safer.
    // However, if we maintain PlayBound/Games, that's fine too.
    return path.join(app.getPath("home"), "Applications", "PlayBound", slug);
  },
  getDownloadsDirectory() {
    return path.join(app.getPath("downloads"), "PlayBound");
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
  async createShortcut({ title, targetPath, args = "", icon = "", description = "" }) {
    throw new Error("Shortcuts are not typically used on macOS in this way.");
  },
  async removeShortcut(title) {
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
    // On macOS, launching an .app bundle is done via `open`
    if (exePath.endsWith(".app")) {
      return ["open", "-a", exePath];
    }
    if (exePath.toLowerCase().endsWith(".jar")) {
      return ["java", "-jar", exePath];
    }
    return [exePath];
  }
};
