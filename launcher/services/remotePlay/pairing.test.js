/**
 * PlayBound Remote device pairing — the request/approve/trust state machine,
 * against a fake `authedFetch` (no real platform API call).
 */

"use strict";

const assert = require("assert");
const { createPendingRequest, isExpired, createPairingService } = require("./pairing");

async function main() {

/* ── createPendingRequest / isExpired ────────────────────────────────────── */

{
  const req = createPendingRequest({ deviceId: "client1", name: "Living Room Laptop" });
  assert.strictEqual(req.status, "pending");
  assert.strictEqual(req.deviceId, "client1");
  assert.ok(req.requestId);
  assert.strictEqual(isExpired(req, req.createdAt + 1000, 2000), false);
  assert.strictEqual(isExpired(req, req.createdAt + 3000, 2000), true);
}

/* ── helper: a fake authedFetch that records calls and can be scripted ──── */

function fakeFetch(script) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const handler = script.find((s) => url.includes(s.match));
    if (!handler) throw new Error(`unscripted fetch: ${url}`);
    return handler.respond();
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(ok, body) {
  return { ok, json: async () => body };
}

/* ── requestPairing: approved resolves true, persists trust ─────────────── */

{
  const requests = [];
  const authedFetch = fakeFetch([
    { match: "/trust", respond: () => jsonResponse(true, { success: true }) },
  ]);
  const svc = createPairingService({
    hostDeviceId: "host1",
    getApiBase: () => "https://example.invalid",
    authedFetch,
    onPairingRequest: (r) => requests.push(r),
  });

  const pairingPromise = svc.requestPairing({ deviceId: "client1", name: "Laptop" });
  assert.strictEqual(requests.length, 1, "onPairingRequest must fire for a new device");
  const requestId = requests[0].requestId;
  assert.strictEqual(svc.listPending().length, 1);

  const responded = await svc.respondToPairing(requestId, true);
  assert.strictEqual(responded, true);
  const allowed = await pairingPromise;
  assert.strictEqual(allowed, true, "approving must resolve the waiting client's promise as true");
  assert.strictEqual(svc.listPending().length, 0, "an answered request must be removed from pending");
  assert.strictEqual(svc.isTrusted("client1"), true, "an approved device must be cached as trusted immediately");

  const trustCall = authedFetch.calls.find((c) => c.url.includes("/trust") && c.init?.method === "POST");
  assert.ok(trustCall, "approval must POST the trust to the platform");
  const body = JSON.parse(trustCall.init.body);
  assert.strictEqual(body.deviceId, "client1");
}

/* ── requestPairing: denied resolves false, nothing persisted ───────────── */

{
  const authedFetch = fakeFetch([]);
  const svc = createPairingService({
    hostDeviceId: "host1",
    getApiBase: () => "https://example.invalid",
    authedFetch,
    onPairingRequest: () => {},
  });

  const pairingPromise = svc.requestPairing({ deviceId: "client2", name: "Travel Laptop" });
  const [request] = svc.listPending();
  await svc.respondToPairing(request.requestId, false);
  const allowed = await pairingPromise;
  assert.strictEqual(allowed, false);
  assert.strictEqual(svc.isTrusted("client2"), false);
  assert.strictEqual(authedFetch.calls.length, 0, "a denial must never call the platform API");
}

/* ── An already-trusted device skips the prompt entirely ────────────────── */

{
  const authedFetch = fakeFetch([
    { match: "/trust", respond: () => jsonResponse(true, { trustedDevices: [{ deviceId: "client3" }] }) },
  ]);
  let promptCount = 0;
  const svc = createPairingService({
    hostDeviceId: "host1",
    getApiBase: () => "https://example.invalid",
    authedFetch,
    onPairingRequest: () => promptCount++,
  });

  await svc.refreshTrusted();
  assert.strictEqual(svc.isTrusted("client3"), true);

  const allowed = await svc.requestPairing({ deviceId: "client3", name: "Already Trusted" });
  assert.strictEqual(allowed, true);
  assert.strictEqual(promptCount, 0, "a re-connecting trusted device must never show the Allow/Deny prompt again");
}

/* ── A request nobody answers times out as denied, not left hanging ─────── */

{
  const authedFetch = fakeFetch([]);
  const svc = createPairingService({
    hostDeviceId: "host1",
    getApiBase: () => "https://example.invalid",
    authedFetch,
    onPairingRequest: () => {},
    ttlMs: 20,
  });

  const allowed = await svc.requestPairing({ deviceId: "client4", name: "Idle" });
  assert.strictEqual(allowed, false, "an unanswered request must eventually resolve false, not hang forever");
}

/* ── respondToPairing on an unknown/already-answered request is a safe no-op ── */

{
  const authedFetch = fakeFetch([]);
  const svc = createPairingService({
    hostDeviceId: "host1",
    getApiBase: () => "https://example.invalid",
    authedFetch,
    onPairingRequest: () => {},
  });
  const responded = await svc.respondToPairing("not-a-real-request-id", true);
  assert.strictEqual(responded, false);
}

/* ── A failed trust POST must not tell the client it's trusted ──────────── */

{
  const authedFetch = fakeFetch([{ match: "/trust", respond: () => jsonResponse(false, { error: "boom" }) }]);
  const svc = createPairingService({
    hostDeviceId: "host1",
    getApiBase: () => "https://example.invalid",
    authedFetch,
    onPairingRequest: () => {},
  });

  const pairingPromise = svc.requestPairing({ deviceId: "client5", name: "Flaky Network" });
  const [request] = svc.listPending();
  await svc.respondToPairing(request.requestId, true);
  const allowed = await pairingPromise;
  assert.strictEqual(allowed, false, "a failed persistence must not report success to the waiting client");
  assert.strictEqual(svc.isTrusted("client5"), false);
}

console.log("remote play pairing ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
