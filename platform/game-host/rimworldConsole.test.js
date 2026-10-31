import test from "node:test";
import assert from "node:assert/strict";
import { privateRimworld, privateRimworldAvailable, rimworldOccupancy } from "./rimworldControl.js";

const room = { roomId: "room_1", gameSlug: "rimworld-together", identityProfile: "rimworld-together-unix-v1",
  communityServerId: "a".repeat(24), pid: 4321, processIdentity: `${"b".repeat(36)}:99` };

function fakeSpawn(stdout, seen) {
  return (file, args, options, callback) => {
    seen.push({ file, args });
    let input = "";
    setImmediate(() => callback(null, stdout, input));
    return { stdin: { end: (value) => { input = value; seen.at(-1).input = value; } } };
  };
}

test("only an isolated RimWorld room with a full process identity uses the relay", () => {
  assert.equal(privateRimworldAvailable(room), true);
  assert.equal(privateRimworldAvailable({ ...room, identityProfile: undefined }), false);
  assert.equal(privateRimworldAvailable({ ...room, processIdentity: "x" }), false);
  assert.equal(privateRimworldAvailable({ ...room, gameSlug: "openra" }), false);
});

test("commands go to the root relay by process identity, never by path", async () => {
  const seen = [];
  await privateRimworld(room, "command", "list", fakeSpawn('{"ok":true}', seen));
  assert.deepEqual(seen[0].args, ["-n", "/usr/local/libexec/playbound-customer-rimworld-console", "command", room.communityServerId, "4321", room.processIdentity]);
  assert.equal(seen[0].input, '{"command":"list"}');
});

test("isolated occupancy comes from the relay and an error is unknown, not empty", async () => {
  const seen = [];
  const doc = await rimworldOccupancy({ ...room, roomId: "room_2" }, 1, fakeSpawn('{"players":[{"name":"Ana","id":null}],"maxPlayers":4,"updatedAt":1}', seen));
  assert.equal(doc.players.length, 1);
  const failing = (file, args, options, callback) => { setImmediate(() => callback(new Error("sudo failed"))); return { stdin: { end() {} } }; };
  assert.equal(await rimworldOccupancy({ ...room, roomId: "room_3" }, 1, failing), null);
});
