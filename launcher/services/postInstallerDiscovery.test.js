"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { findInstalledExecutable, windowsDiscoveryRoots } = require("./postInstallerDiscovery");
const entry = { title: "SRB2Kart", slug: "srb2kart" };
const wanted = ["srb2kart.exe"];
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "playbound-install-discovery-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  async function file(relative) {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, "test executable placeholder");
    return full;
  }
  return { root, file };
}
test("discovers SRB2Kart in a versioned, spaced folder outside Program Files", async (t) => {
  const { root, file } = await fixture(t);
  const exe = await file("SRB2 Kart v1.6/bin/srb2kart.exe");
  await file("SRB2 Kart v1.6/srb2kart-v16-Installer.exe");
  assert.equal(await findInstalledExecutable({ entry, roots: [root], wanted }), exe);
});
test("Start Menu shortcut resolves an install in an otherwise unknown custom directory", async (t) => {
  const { root, file } = await fixture(t);
  const target = await file("custom/vendor/build/srb2kart.exe");
  const shortcut = await file("Start Menu/Kart Krew/Play.lnk");
  assert.equal(await findInstalledExecutable({ entry, shortcutRoots: [path.join(root, "Start Menu")], wanted,
    readShortcutLink: (name) => { assert.equal(name, shortcut); return { target }; } }), target);
});
test("never accepts an installer/uninstaller, even when a recipe or shortcut names it", async (t) => {
  const { root, file } = await fixture(t);
  const target = await file("SRB2Kart/uninstall.exe");
  await file("Start Menu/SRB2Kart.lnk");
  assert.equal(await findInstalledExecutable({ entry, roots: [root], shortcutRoots: [path.join(root, "Start Menu")],
    wanted: [...wanted, "uninstall.exe"], readShortcutLink: () => ({ target }) }), null);
});
test("does not walk unrelated product folders or claim an arbitrary generic game.exe", async (t) => {
  const { root, file } = await fixture(t);
  await file("Another Game/srb2kart.exe");
  await file("game.exe");
  assert.equal(await findInstalledExecutable({ entry, roots: [root], wanted: [...wanted, "game.exe"] }), null);
});
test("generic executable names are accepted only inside a matching product directory", async (t) => {
  const { root, file } = await fixture(t);
  const target = await file("SRB2Kart/game.exe");
  assert.equal(await findInstalledExecutable({ entry, roots: [root], wanted: ["game.exe"] }), target);
});
test("ambiguous installations require a choice rather than picking the first", async (t) => {
  const { root, file } = await fixture(t);
  await file("SRB2Kart v1.5/srb2kart.exe");
  await file("SRB2Kart v1.6/srb2kart.exe");
  assert.equal(await findInstalledExecutable({ entry, roots: [root], wanted }), null);
});
test("missing roots, broken shortcuts, cancellation and a directory budget are bounded misses", async (t) => {
  const { root, file } = await fixture(t);
  await file("Start Menu/SRB2Kart.lnk");
  const options = { entry, wanted, roots: [path.join(root, "missing")], shortcutRoots: [path.join(root, "Start Menu")],
    readShortcutLink: () => { throw Error("broken shortcut"); } };
  assert.equal(await findInstalledExecutable(options), null);
  assert.equal(await findInstalledExecutable({ ...options, isCancelled: () => true }), null);
  assert.equal(await findInstalledExecutable({ ...options, maxDirectories: 0 }), null);
});
test("duplicate roots/shortcut targets do not make a unique installation ambiguous", async (t) => {
  const { root, file } = await fixture(t);
  const target = await file("SRB2Kart/srb2kart.exe");
  await file("Start Menu/SRB2Kart.lnk");
  assert.equal(await findInstalledExecutable({ entry, roots: [root, root], shortcutRoots: [path.join(root, "Start Menu")], wanted,
    readShortcutLink: () => ({ target }) }), target);
});
test("Windows search includes user Programs, Downloads, Desktop and fixed-drive game roots", () => {
  const result = windowsDiscoveryRoots({ drives: ["D:/"], home: "C:/Users/Test", env: { LOCALAPPDATA: "C:/Users/Test/AppData/Local", APPDATA: "C:/Users/Test/AppData/Roaming" } });
  assert.ok(result.roots.includes(path.join("D:/", "Games")));
  assert.ok(result.roots.includes(path.join("C:/Users/Test", "Downloads")));
  assert.ok(result.roots.includes(path.join("C:/Users/Test/AppData/Local", "Programs")));
  assert.ok(result.shortcutRoots.includes(path.join("C:/Users/Test", "Desktop")));
});
const vm = require("node:vm");
const source = require("./testing-mainSource").readMainSource();
function pollHarness() {
  const begin = source.indexOf("function startInstallerPoll(");
  const end = source.indexOf("/** Resume watching pending installs", begin);
  let resolveSearch;
  const registered = [];
  const context = {
    installerPollGeneration: 0, installerPollSlug: null, installerPollOnComplete: null,
    stopInstallerPoll() { context.installerPollGeneration++; context.installerPollSlug = null; context.installerPollOnComplete = null; },
    stopExeScan() {}, markPendingInstall() {}, isDarkModSlug: () => false,
    findKnownPathOnly: () => null, findExeInSlugGamesDir: () => null,
    findKnownExecutable: () => null, invalidateUninstallCache() {},
    fs: { existsSync: () => false }, win: null, Date, console,
    discoverPostInstallerExecutable: () => new Promise((resolve) => { resolveSearch = resolve; }),
    markInstalledFromExe: (...args) => { registered.push(args); return { status: "installed" }; },
    completeInstallerPoll() { context.stopInstallerPoll(); }, setInterval: () => 1,
  };
  vm.createContext(context);
  vm.runInContext(source.slice(begin, end), context);
  return { context, registered, resolve: (value) => resolveSearch(value) };
}
test("an asynchronous discovery result after cancellation cannot resurrect an install", async () => {
  const h = pollHarness();
  h.context.startInstallerPoll("srb2kart", entry, "v1.6", () => {});
  h.context.stopInstallerPoll();
  h.resolve("C:/Games/SRB2Kart/srb2kart.exe");
  await new Promise(setImmediate);
  assert.equal(h.registered.length, 0);
});
test("the waiting installer is completed automatically when scoped discovery finds the game", async () => {
  const h = pollHarness();
  h.context.startInstallerPoll("srb2kart", entry, "v1.6", () => {});
  h.resolve("C:/Games/SRB2Kart/srb2kart.exe");
  await new Promise(setImmediate);
  assert.equal(h.registered.length, 1);
  assert.equal(h.registered[0][2], "C:/Games/SRB2Kart/srb2kart.exe");
  assert.equal(h.context.installerPollSlug, null);
});
