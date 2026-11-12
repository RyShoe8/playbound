"use strict";

const assert = require("assert");
const path = require("path");
const { steamAppState, steamRuntimeForLaunch, steamAppIdFromLibraryPath } = require("./steamPrerequisites");

function fakeIo(files, dirs = []) {
  return {
    readFileSync(file) {
      if (!(file in files)) throw new Error("ENOENT");
      return files[file];
    },
    existsSync(file) {
      return dirs.includes(file);
    },
  };
}

const root = "C:\\SteamLibrary";
const manifest = `${root}\\steamapps\\appmanifest_218.acf`;
const contentDir = `${root}\\steamapps\\common\\Source SDK Base 2007`;

{
  const io = fakeIo(
    {
      [manifest]: `"AppState"\n{\n  "appid" "218"\n  "StateFlags" "4"\n  "installdir" "Source SDK Base 2007"\n}`,
    },
    [contentDir]
  );
  assert.deepStrictEqual(steamAppState("218", [root], io), {
    installed: true,
    progress: 1,
    contentDir,
    manifest,
  });
}

{
  const io = fakeIo({
    [manifest]: `"AppState"\n{\n  "StateFlags" "1026"\n  "installdir" "Source SDK Base 2007"\n  "BytesDownloaded" "250"\n  "BytesToDownload" "1000"\n}`,
  });
  assert.deepStrictEqual(steamAppState("218", [root], io), {
    installed: false,
    progress: 0.25,
  });
}

assert.deepStrictEqual(steamAppState("not-an-id", [root], fakeIo({})), {
  installed: false,
  progress: null,
});

// HoloCure's standalone ZIP has a Steam listing in catalog metadata, but
// launching that copy must not start Steam or write steam_appid.txt beside it.
assert.deepStrictEqual(
  steamRuntimeForLaunch("direct-zip", "C:\\Users\\Player\\PlayBound\\Games\\holocure\\HoloCure.exe", "2420510"),
  { needsSteam: false, appId: null }
);
assert.deepStrictEqual(
  steamRuntimeForLaunch("direct-zip", "D:\\SteamLibrary\\steamapps\\common\\HoloCure\\HoloCure.exe", "2420510"),
  { needsSteam: true, appId: "2420510" }
);
assert.deepStrictEqual(steamRuntimeForLaunch("steam", "D:\\Games\\AlienSwarm.exe", "630"), {
  needsSteam: true,
  appId: "630",
});

{
  // HoloCure from Steam: the catalog row is the itch.io build with no app id.
  const steamapps = String.raw`D:\SteamLibrary\steamapps`;
  const io = {
    readdirSync(dir) {
      if (dir !== steamapps) throw new Error("ENOENT");
      return ["appmanifest_228980.acf", "appmanifest_2420510.acf", "libraryfolders.vdf"];
    },
    readFileSync(file) {
      if (file === path.join(steamapps, "appmanifest_228980.acf")) return '"AppState"\n{\n\t"appid"\t"228980"\n\t"installdir"\t"Steamworks Shared"\n}';
      if (file === path.join(steamapps, "appmanifest_2420510.acf")) return '"AppState"\n{\n\t"appid"\t"2420510"\n\t"installdir"\t"HoloCure"\n}';
      throw new Error("ENOENT");
    },
  };
  assert.strictEqual(steamAppIdFromLibraryPath(String.raw`D:\SteamLibrary\steamapps\common\HoloCure\HoloCure.exe`, io), "2420510");
  assert.strictEqual(steamAppIdFromLibraryPath(String.raw`D:\SteamLibrary\steamapps\common\holocure\HoloCure.exe`, io), "2420510");
  assert.strictEqual(steamAppIdFromLibraryPath(String.raw`D:\SteamLibrary\steamapps\common\Other\x.exe`, io), null);
  assert.strictEqual(steamAppIdFromLibraryPath(String.raw`C:\Users\p\PlayBound\Games\holocure\HoloCure.exe`, io), null);
}

console.log("steamPrerequisites tests passed");
