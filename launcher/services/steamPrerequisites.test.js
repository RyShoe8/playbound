"use strict";

const assert = require("assert");
const { steamAppState, steamRuntimeForLaunch } = require("./steamPrerequisites");

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

console.log("steamPrerequisites tests passed");
