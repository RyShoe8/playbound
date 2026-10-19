import test from "node:test";
import assert from "node:assert/strict";
import { rvglDisplayForPort, validateRvglInput, sharedRvglLobbyAvailable, privateRvglLobbyAvailable, privateRvglLobby } from "./rvglDisplay.js";

test("shared RVGL display controls cannot target a private identity", () => {
  assert.equal(sharedRvglLobbyAvailable({ gameSlug: "re-volt-rvgl", identityProfile: null }), true);
  assert.equal(sharedRvglLobbyAvailable({ gameSlug: "re-volt-rvgl", identityProfile: "re-volt-rvgl-unix-v1" }), false);
  assert.equal(sharedRvglLobbyAvailable({ gameSlug: "core-keeper", identityProfile: null }), false);
});

const privateRoom = { gameSlug: "re-volt-rvgl", identityProfile: "re-volt-rvgl-unix-v1",
  communityServerId: "fffffffffffffffffffffff1", pid: 1234,
  processIdentity: "12345678-1234-1234-1234-123456789abc:987" };

test("private RVGL display is tied to the managed room identity", async () => {
  assert.equal(privateRvglLobbyAvailable(privateRoom), true);
  assert.equal(privateRvglLobbyAvailable({ ...privateRoom, communityServerId: null }), false);
  assert.equal(privateRvglLobbyAvailable({ ...privateRoom, identityProfile: null }), false);
  const calls = [];
  const fake = (binary, args, options, callback) => {
    calls.push({ binary, args, options });
    callback(null, '{"ok":true}', '');
    return { stdin: { end(input) { calls.push({ input }); } } };
  };
  assert.deepEqual(await privateRvglLobby(privateRoom, "input", { type: "key", key: "Return" }, fake), { ok: true });
  assert.equal(calls[0].binary, "/usr/bin/sudo");
  assert.deepEqual(calls[0].args.slice(0, 3), ["-n", "/usr/local/libexec/playbound-customer-rvgl-lobby", "input"]);
  assert.equal(calls[0].args[3], privateRoom.communityServerId);
  assert.equal(calls[1].input, '{"type":"key","key":"Return"}');
  await assert.rejects(privateRvglLobby(privateRoom, "input", { type: "key", key: "Ctrl+Alt+Delete" }, fake));
  assert.equal(calls.length, 2);
});

test("RVGL display is tied to its allocated room port", () => {
  assert.deepEqual(rvglDisplayForPort(2310), {
    display: ":2310", authFile: "/var/lib/playbound-host/rvgl-displays/2310.xauth",
  });
  assert.throws(() => rvglDisplayForPort(1234));
  assert.throws(() => rvglDisplayForPort(2310.5));
});

test("lobby input permits bounded clicks and navigation only", () => {
  assert.deepEqual(validateRvglInput({ type: "click", x: 639, y: 479 }), { type: "click", x: 639, y: 479 });
  assert.deepEqual(validateRvglInput({ type: "key", key: "Return" }), { type: "key", key: "Return" });
  for (const input of [
    { type: "click", x: -1, y: 2 },
    { type: "click", x: 640, y: 1 },
    { type: "click", x: 2.5, y: 4 },
    { type: "key", key: "Ctrl+Alt+Delete" },
    { type: "key", key: "a;touch /tmp/pwned" },
    null,
  ]) assert.throws(() => validateRvglInput(input));
});
