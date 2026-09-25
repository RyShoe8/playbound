"use strict";

/*
 * Moved out of main.js unchanged: helpers that touch no main-process state
 * (no windows, sessions or timers). main.js requires what it needs from here.
 */

const { app, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { parseDeepLink } = require("./core");
const LAUNCHER_ROOT = path.join(__dirname, "..", "..");

function resolveAssetPath(filename) {
  const candidates = [
    path.join(LAUNCHER_ROOT, "assets", filename),
    path.join(LAUNCHER_ROOT.replace("app.asar", "app.asar.unpacked"), "assets", filename),
    path.join(process.resourcesPath || "", "assets", filename),
    path.join(process.resourcesPath || "", "app.asar.unpacked", "assets", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(LAUNCHER_ROOT, "assets", filename);
}

function getTrayIcon() {
  const assetPath = resolveAssetPath("tray-icon.png");

  // On Linux (GNOME Shell, KDE Plasma, XFCE via AppIndicator/StatusNotifierItem),
  // tray icons are read by the system desktop shell via D-Bus file path.
  // When packaged in an app.asar, external system processes cannot read inside
  // Electron's virtual archive and fall back to the system theme's generic gear/settings
  // icon. We ensure a physical copy exists on disk in userData.
  if (process.platform === "linux") {
    try {
      const iconDir = app.getPath("userData");
      const diskIconPath = path.join(iconDir, "tray-icon.png");
      if (!fs.existsSync(diskIconPath)) {
        if (fs.existsSync(assetPath)) {
          const buf = fs.readFileSync(assetPath);
          fs.writeFileSync(diskIconPath, buf);
        }
      }
      if (fs.existsSync(diskIconPath)) {
        return diskIconPath;
      }
    } catch (err) {
      console.warn("Could not cache tray icon on disk for Linux:", err);
    }
  }

  // Windows & macOS: Load from buffer to ensure valid decoding across packaged builds
  try {
    if (fs.existsSync(assetPath)) {
      const buf = fs.readFileSync(assetPath);
      let icon = nativeImage.createFromBuffer(buf);
      if (!icon.isEmpty()) {
        // Windows notification area standard size is 16x16. macOS menu bar is 18x18.
        const targetSize = process.platform === "win32" ? 16 : process.platform === "darwin" ? 18 : 24;
        icon = icon.resize({ width: targetSize, height: targetSize });
        return icon;
      }
    }
  } catch (err) {
    console.warn("Could not create tray icon from buffer:", err);
  }

  let icon = nativeImage.createFromPath(assetPath);
  if (!icon.isEmpty()) {
    const targetSize = process.platform === "win32" ? 16 : process.platform === "darwin" ? 18 : 24;
    return icon.resize({ width: targetSize, height: targetSize });
  }
  return assetPath;
}

/* ── headless self-test: deep link parsing ───────────────────────────── */

function testDeepLink() {
  const cases = [
    ["playbound://install/openra", { action: "install", slug: "openra" }],
    ["playbound://play/warzone-2100", { action: "play", slug: "warzone-2100" }],
    ["playbound://uninstall/openra", { action: "uninstall", slug: "openra" }],
    ["playbound://install/openra/", { action: "install", slug: "openra" }],
    [
      "playbound://join/openra?host=1.2.3.4&port=1234&name=Test",
      { action: "join", slug: "openra", host: "1.2.3.4", port: 1234, name: "Test" },
    ],
    ["playbound://auth", { action: "auth" }],
    ["playbound://sync", { action: "sync" }],
    ["playbound://link?code=abc", { action: "link", code: "abc" }],
    // A durable bearer in the URL must not survive parsing: honouring it let any
    // web page rebind someone else's launcher to the attacker's account.
    ["playbound://link?token=abc", { action: "link", code: "" }],
    ["playbound://install-mod/cool-mod", { action: "install-mod", slug: "cool-mod" }],
    ["playbound://play-mod/openra-tiberian-dawn-hd", { action: "play-mod", slug: "openra-tiberian-dawn-hd" }],
    ["playbound://open-folder/openra", { action: "open-folder", slug: "openra" }],
    ["playbound://open-folder-mod/cool-mod", { action: "open-folder-mod", slug: "cool-mod" }],
    ["playbound://uninstall-mod/cool-mod", { action: "uninstall-mod", slug: "cool-mod" }],
    ["playbound://locate/naev", { action: "locate", slug: "naev" }],
    ["not-a-deep-link", null],
  ];
  let failures = 0;
  for (const [url, expected] of cases) {
    const got = parseDeepLink(url);
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    if (!ok) {
      failures++;
      console.log(`FAIL  ${url}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(got)}`);
    } else {
      console.log(`OK    ${url}`);
    }
  }
  console.log(failures === 0 ? "Deep link parsing OK" : `${failures} deep-link failure(s)`);
  app.exit(failures === 0 ? 0 : 1);
}

module.exports = { resolveAssetPath, getTrayIcon, testDeepLink };
