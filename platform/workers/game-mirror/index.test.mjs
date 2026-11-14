import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const env = { MIRROR_GATEWAY_SECRET: "test-secret" };

test("rejects other hosts and unsafe archive paths before signing", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected fetch"); };
  for (const url of [
    "https://other.example/games/example.zip",
    "https://mirror.playbound.club/artifacts/launcher.exe",
    "https://mirror.playbound.club/games/%2e%2e/secret.zip",
  ]) {
    const result = await worker.fetch(new Request(url), env);
    assert.ok(result.status >= 400);
  }
  assert.equal(calls, 0);
});

test("streams a signed S3 range response without buffering it", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      assert.equal(options.headers.authorization, "Bearer test-secret");
      return Response.json({ url: "https://s3.rogly.net/playbound/games/example.zip?signature=short", sizeBytes: 100 });
    }
    assert.equal(options.headers.range, "bytes=10-19");
    return new Response(new Uint8Array(10), { status: 206, headers: {
      "content-range": "bytes 10-19/100", "content-length": "10", "accept-ranges": "bytes",
    } });
  };
  const result = await worker.fetch(new Request("https://mirror.playbound.club/games/example.zip", {
    headers: { range: "bytes=10-19" },
  }), env);
  assert.equal(result.status, 206);
  assert.equal(result.headers.get("content-range"), "bytes 10-19/100");
  assert.equal((await result.arrayBuffer()).byteLength, 10);
  assert.equal(calls.length, 2);
});

test("never follows a signed URL outside the configured Ceph origin", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ url: "https://evil.example/game.zip", sizeBytes: 100 });
  };
  const result = await worker.fetch(new Request("https://mirror.playbound.club/games/example.zip"), env);
  assert.equal(result.status, 503);
  assert.equal(calls, 1);
});

test("preview hostname requires the shared secret", async () => {
  let called = 0;
  globalThis.fetch = async () => { called++; return new Response("unavailable", { status: 404 }); };
  const url = "https://playbound-game-mirror.example.workers.dev/games/example.zip";
  assert.equal((await worker.fetch(new Request(url), env)).status, 503);
  assert.equal(called, 0);
  assert.equal((await worker.fetch(new Request(url, {
    headers: { "x-playbound-preview-secret": env.MIRROR_GATEWAY_SECRET },
  }), env)).status, 404);
  assert.equal(called, 1);
});
