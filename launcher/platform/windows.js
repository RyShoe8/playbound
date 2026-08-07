const os = require("os");
const path = require("path");
const fs = require("fs");
const { app, shell } = require("electron");

module.exports = {
  getOS() {
    return "windows";
  },
  getOSVersion() {
    return os.release();
  },
  getArchitecture() {
    return os.arch();
  },
  getExecutableExtension() {
    return ".exe";
  },
  getInstallDirectory(slug) {
    return path.join(app.getPath("home"), "PlayBound", "Games", slug);
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
  async createShortcut({ title, targetPath, args = "", icon = "", description = "" }) {
    const desktop = app.getPath("desktop");
    const shortcutPath = path.join(desktop, `${title}.lnk`);
    const ok = shell.writeShortcutLink(shortcutPath, "create", {
      target: targetPath,
      args,
      icon,
      description,
    });
    if (!ok) throw new Error("Couldn't create desktop shortcut");
  },
  async removeShortcut(title) {
    const shortcutPath = path.join(app.getPath("desktop"), `${title}.lnk`);
    if (fs.existsSync(shortcutPath)) {
      await fs.promises.unlink(shortcutPath);
    }
  },
  supportsDesktopShortcuts() {
    return true;
  },
  supportsStartMenuShortcuts() {
    return true;
  },
  supportsDock() {
    return false;
  },
  killProcess(pid) {
    process.kill(pid);
  },
  getGameLaunchCommand(exePath) {
    if (exePath.toLowerCase().endsWith(".jar")) {
      return ["java", "-jar", exePath];
    }
    return [exePath];
  }
};
