import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { encodeJsonResponse } from "./jsonResponse.js";

test("large server lists are compressed when the client accepts gzip", () => {
  const payload = { servers: Array.from({ length: 200 }, (_, i) => ({ id: `server-${i}`, gameType: "multiplayer", players: 2 })) };
  const encoded = encodeJsonResponse(payload, "gzip, deflate");
  assert.equal(encoded.encoding, "gzip");
  assert.ok(encoded.body.length < encoded.plainBytes / 2);
  assert.deepEqual(JSON.parse(gunzipSync(encoded.body).toString()), payload);
});

test("small responses and clients without gzip receive plain JSON", () => {
  const payload = { ok: true };
  for (const header of ["gzip", "", "gzip;q=0"]) {
    const encoded = encodeJsonResponse(payload, header);
    assert.equal(encoded.encoding, null);
    assert.deepEqual(JSON.parse(encoded.body.toString()), payload);
  }
  const large = encodeJsonResponse({ text: "playbound ".repeat(500) }, "gzip;q=0");
  assert.equal(large.encoding, null);
});
