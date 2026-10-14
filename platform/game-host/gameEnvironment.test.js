import { test } from "node:test";
import assert from "node:assert/strict";
import { gameEnvironment } from "./gameEnvironment.js";

test("games never inherit agent, database, deployment or arbitrary secrets", () => {
  const parent = { PATH: "/usr/bin", HOME: "/fixture", GAME_HOST_SECRET: "fixture-secret", MONGODB_URI: "fixture-db", VERCEL_TOKEN: "fixture-deploy", GITHUB_TOKEN: "fixture-github", NEW_UNKNOWN_CREDENTIAL: "fixture-unknown" };
  assert.deepEqual(gameEnvironment(parent), { PATH: "/usr/bin", HOME: "/fixture" });
  assert.deepEqual(gameEnvironment(parent, { ...parent, GAME_HOST_SECRET: "reintroduced", HOME: "/isolated" }), { PATH: "/usr/bin", HOME: "/isolated" });
});
test("preserves explicit engine runtimes, private HOME and display/library settings", () => {
  assert.deepEqual(gameEnvironment({ PATH: "/usr/bin", HOME: "/shared", WINEPREFIX: "/wine", LANG: "C.UTF-8", LD_LIBRARY_PATH: "/engine/lib", SteamAppId: "232250" }, { HOME: "/private/pb-fixture", DISPLAY: ":99", XDG_CONFIG_HOME: "/private/config" }), {
    PATH: "/usr/bin", HOME: "/private/pb-fixture", WINEPREFIX: "/wine", LANG: "C.UTF-8", LD_LIBRARY_PATH: "/engine/lib", SteamAppId: "232250", DISPLAY: ":99", XDG_CONFIG_HOME: "/private/config",
  });
});
test("rejects malformed values and supplies a bounded default path", () => {
  assert.deepEqual(gameEnvironment({ PATH: "bad\0path", HOME: null, LD_PRELOAD: "/arbitrary.so", NODE_OPTIONS: "--inspect" }), { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/games" });
});

test("keeps the existing nonstandard game asset and TripleA recipe variables", () => {
  const recipe = { ALSOFT_DRIVERS: "null", VELOREN_ASSETS: "/fixture/assets", DOOMWADDIR: "/fixture/doom", DOOMWADPATH: "/fixture/doom:/usr/share/games/doom", BOT_COMMENT: "automated_host", BOT_NAME: "Bot_PB_3300", BOT_PORT: "3300", BOT_LOBBY_URI: "https://prod.triplea-game.org", MAPS_FOLDER: "/fixture/maps" };
  assert.deepEqual(gameEnvironment({ PATH: "/usr/bin" }, recipe), { PATH: "/usr/bin", ...recipe });
});
