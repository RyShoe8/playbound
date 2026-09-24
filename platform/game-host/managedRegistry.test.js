import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createManagedRegistry, isSameProcess, processIdentity, rehydrateManagedRoom } from "./managedRegistry.js";

test("managed manifest survives a new registry instance", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "playbound-managed-"));
  try {
    const first = createManagedRegistry(dir);
    assert.deepEqual(first.read(), []);
    first.write([{ communityServerId: "server-1", pid: process.pid }]);
    assert.deepEqual(createManagedRegistry(dir).read(), [{ communityServerId: "server-1", pid: process.pid }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("recovery requires the same Linux process, not just a reused PID", () => {
  const identity = processIdentity(process.pid);
  if (process.platform !== "linux") return;
  assert.ok(identity);
  assert.equal(isSameProcess(process.pid, identity), true);
  assert.equal(isSameProcess(process.pid, "wrong:1"), false);
});

test("a recovered room retains process identity for safe stop", () => {
  const identity = "boot:123";
  const room = rehydrateManagedRoom({ communityServerId: "server-1", pid: 123, identity });
  assert.equal(room.processIdentity, identity);
  assert.equal(room.child, null);
  assert.equal(room.partyId, null);
});
