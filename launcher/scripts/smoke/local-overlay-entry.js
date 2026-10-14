const { app, BrowserWindow } = require("electron");
const path = require("node:path");
if (!process.env.PLAYBOUND_SMOKE_ROOT) throw new Error("Isolated smoke root required");
app.setPath("userData", process.env.PLAYBOUND_SMOKE_ROOT);
app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 440, height: 720, show: false,
    webPreferences: { preload: path.join(__dirname, "local-overlay-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  void window.loadFile(path.join(__dirname, "../../renderer/overlay.html"));
});
app.on("window-all-closed", () => app.quit());
