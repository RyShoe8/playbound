"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { isPlayboundNativeGame, fetchGameToken, withGameToken } = require("./playboundGameToken");

function fakeFetch(status, body, calls = []) {
  return async (url, opts) => {
    calls.push({ url, opts });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

test("only PlayBound-native games get a token", () => {
  assert.strictEqual(isPlayboundNativeGame("hyperdisc-arena"), true);
  assert.strictEqual(isPlayboundNativeGame("HyperDisc-Arena"), true);
  assert.strictEqual(isPlayboundNativeGame("supertuxkart"), false);
  assert.strictEqual(isPlayboundNativeGame(""), false);
});

test("asks the site for a game-scoped token with the launcher bearer", async () => {
  const calls = [];
  const token = await fetchGameToken({
    slug: "hyperdisc-arena",
    launcherToken: "launcher-secret",
    apiBase: "https://playbound.club",
    fetchImpl: fakeFetch(201, { token: "game-token", user: { id: "u1" } }, calls),
  });
  assert.strictEqual(token, "game-token");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "https://playbound.club/api/game-auth/launcher-token");
  assert.strictEqual(calls[0].opts.method, "POST");
  assert.strictEqual(calls[0].opts.headers.authorization, "Bearer launcher-secret");
  assert.deepStrictEqual(JSON.parse(calls[0].opts.body), { gameSlug: "hyperdisc-arena" });
});

test("no request for other games or when signed out", async () => {
  const calls = [];
  const fetchImpl = fakeFetch(201, { token: "x" }, calls);
  assert.strictEqual(await fetchGameToken({ slug: "openttd", launcherToken: "t", apiBase: "b", fetchImpl }), null);
  assert.strictEqual(await fetchGameToken({ slug: "hyperdisc-arena", launcherToken: "", apiBase: "b", fetchImpl }), null);
  assert.strictEqual(calls.length, 0);
});

test("failures start the game signed out instead of blocking it", async () => {
  const base = { slug: "hyperdisc-arena", launcherToken: "t", apiBase: "b" };
  assert.strictEqual(await fetchGameToken({ ...base, fetchImpl: fakeFetch(401, { error: "no" }) }), null);
  assert.strictEqual(await fetchGameToken({ ...base, fetchImpl: fakeFetch(201, {}) }), null);
  const throwing = async () => {
    throw new Error("offline");
  };
  assert.strictEqual(await fetchGameToken({ ...base, fetchImpl: throwing }), null);
});

test("withGameToken adds PLAYBOUND_TOKEN without dropping the existing env", () => {
  const env = withGameToken({ DOTNET_ROOT: "C:\\dotnet" }, "game-token");
  assert.deepStrictEqual(env, { DOTNET_ROOT: "C:\\dotnet", PLAYBOUND_TOKEN: "game-token" });
  const untouched = { A: "1" };
  assert.strictEqual(withGameToken(untouched, null), untouched);
  assert.strictEqual(withGameToken(undefined, "t").PLAYBOUND_TOKEN, "t");
});
