import { test } from "node:test";
import assert from "node:assert/strict";
import { parseA2sInfo } from "./a2sQuery.js";

test("A2S info reads player count after the four variable-length names", () => {
  const packet = Buffer.concat([
    Buffer.from([255, 255, 255, 255, 0x49, 17]),
    Buffer.from("PlayBound\0de_dust2\0csgo\0Counter-Strike 2\0"),
    Buffer.from([0xda, 0x02, 3, 16, 1]),
  ]);
  assert.equal(parseA2sInfo(packet), 2);
  packet[packet.length - 3] = 1;
  packet[packet.length - 1] = 1;
  assert.equal(parseA2sInfo(packet), 0);
  assert.equal(parseA2sInfo(Buffer.from([255, 255, 255, 255, 0x41])), null);
});
