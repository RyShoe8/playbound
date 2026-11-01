"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { epicStoreSlug, isEpicLauncherStoreLink, isEpicLauncherInstalled, epicStoreOpenUrl } = require("./epicLauncher");
const { createSecurity } = require("./security");

test("reads the product slug from Epic store URLs, with or without a locale", () => {
  assert.equal(epicStoreSlug("https://store.epicgames.com/p/pinball-fx"), "pinball-fx");
  assert.equal(epicStoreSlug("https://store.epicgames.com/en-US/p/pinball-fx"), "pinball-fx");
  assert.equal(epicStoreSlug("https://store.epicgames.com/p/pinball-fx?lang=en-US"), "pinball-fx");
  assert.equal(epicStoreSlug("http://store.epicgames.com/p/pinball-fx"), null);
  assert.equal(epicStoreSlug("https://store.epicgames.com.evil.example/p/pinball-fx"), null);
  assert.equal(epicStoreSlug("https://store.steampowered.com/app/2328760/"), null);
});

test("the allowlist lets through only Epic store pages, not the handler's other commands", () => {
  const { assertOpenExternalUrl } = createSecurity({ isPackaged: true, getApiBase: () => "https://playbound.club" });
  assert.equal(assertOpenExternalUrl("com.epicgames.launcher://store/p/pinball-fx"), "com.epicgames.launcher://store/p/pinball-fx");
  for (const blocked of [
    "com.epicgames.launcher://apps/Fortnite?action=launch&silent=true",
    "com.epicgames.launcher://store/p/pinball-fx?action=install",
    "com.epicgames.launcher://store/p/pinball-fx#x",
    "com.epicgames.launcher://store/../apps/x",
  ]) {
    assert.throws(() => assertOpenExternalUrl(blocked), /Blocked external URL scheme/, blocked);
  }
  assert.equal(isEpicLauncherStoreLink(new URL("com.epicgames.launcher://store/p/vector-pinball")), true);
});

test("opens the launcher link when Epic is installed, and keeps the web page when it is not", async () => {
  const installed = { platform: "win32", env: { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)" }, exists: (p) => p.endsWith("Win64\\EpicGamesLauncher.exe"), regQuery: async () => false };
  const absent = { ...installed, exists: () => false, regQuery: async () => false };
  const otherDrive = { ...absent, regQuery: async (key) => key === "HKCR\\com.epicgames.launcher" };
  assert.equal(await isEpicLauncherInstalled(installed), true);
  assert.equal(await isEpicLauncherInstalled(absent), false);
  assert.equal(await isEpicLauncherInstalled(otherDrive), true);
  assert.equal(await isEpicLauncherInstalled({ platform: "linux" }), false);
  assert.equal(await epicStoreOpenUrl("https://store.epicgames.com/p/pinball-fx", installed), "com.epicgames.launcher://store/p/pinball-fx");
  assert.equal(await epicStoreOpenUrl("https://store.epicgames.com/p/pinball-fx", absent), null);
  assert.equal(await epicStoreOpenUrl("https://example.com/", installed), null);
});
