"use strict";

const assert = require("node:assert/strict");
const { resolveGameJoltBuild, GAMEJOLT_BUILD_ENDPOINT } = require("./gameJoltBuild");

(async () => {
  let request;
  const url = await resolveGameJoltBuild("1938424", {
    fetchImpl: async (input, init) => {
      request = { input, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ payload: { url: "https://download.gamejolt.net/file/ver0-8-5.rar?token=x" } }),
      };
    },
  });
  assert.equal(request.input, `${GAMEJOLT_BUILD_ENDPOINT}/1938424`);
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(request.init.body), { forceDownload: true });
  assert.equal(url, "https://download.gamejolt.net/file/ver0-8-5.rar?token=x");

  await assert.rejects(() => resolveGameJoltBuild("not-a-build"), /invalid/);
  await assert.rejects(
    () => resolveGameJoltBuild("1", { fetchImpl: async () => ({ ok: true, json: async () => ({ payload: { url: "https://evil.example/game.rar" } }) }) }),
    /untrusted/
  );
  console.log("gameJoltBuild tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
