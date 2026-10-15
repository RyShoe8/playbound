import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createManagedRegistry, createManagedJobs, isSameProcess, processIdentity, rehydrateManagedRoom, recoveredManagedRoomExited } from "./managedRegistry.js";

test("stop and failure evidence survives restart without saving room credentials", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "playbound-jobs-"));
  try {
    const jobs = createManagedJobs(dir);
    jobs.set("stopped", { status: "stopped", at: 1 });
    jobs.set("failed", { status: "failed", error: "Exited 1", at: 2, room: { rconPassword: "secret" } });
    jobs.set("pending", { status: "pending", startedAt: 3 });
    const recovered = createManagedJobs(dir);
    assert.equal(recovered.get("stopped").status, "stopped");
    assert.equal(recovered.get("failed").error, "Exited 1");
    assert.equal(recovered.get("pending").status, "failed");
    assert.equal(fs.readFileSync(path.join(dir, "managed-jobs.json"), "utf8").includes("secret"), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

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

test("UID enrollment survives stopped, failed and interrupted jobs without silently reverting to the agent user", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "playbound-uid-jobs-"));
  try {
    const jobs = createManagedJobs(dir);
    jobs.set("customer", { status: "pending", identityProfile: "teeworlds-unix-v1" });
    const recovered = createManagedJobs(dir);
    assert.equal(recovered.get("customer").status, "failed");
    assert.equal(recovered.get("customer").identityProfile, "teeworlds-unix-v1");
    for (const status of ["running", "stopped", "pending", "failed"]) recovered.set("customer", { status });
    assert.equal(createManagedJobs(dir).get("customer").identityProfile, "teeworlds-unix-v1");
    assert.throws(() => recovered.set("customer", { status: "pending", identityProfile: null }), /downgraded/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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

test("only a dead recovered managed room needs liveness reaping", () => {
  const recovered = rehydrateManagedRoom({ communityServerId: "server-1", pid: 123, identity: "boot:123" });
  assert.equal(recoveredManagedRoomExited(recovered, () => false), true);
  assert.equal(recoveredManagedRoomExited(recovered, () => true), false);
  assert.equal(recoveredManagedRoomExited({ ...recovered, child: {} }, () => false), false);
  assert.equal(recoveredManagedRoomExited({ ...recovered, communityServerId: null }, () => false), false);
});
