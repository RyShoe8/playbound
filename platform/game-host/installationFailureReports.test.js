import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createInstallationStore } from "./installationJobs.js";
import { createInstallationFailureReporter } from "./installationFailureReports.js";

function fixture(t) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "pb-failure-reports-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const store = createInstallationStore(stateDir), id = randomUUID();
  store.write({ id, key: "team-fortress-2", action: "update", status: "failed", createdAt: 1, message: "Steam download failed" });
  return { stateDir, store, id };
}
test("delivery survives network failure and agent restart without losing failures", async (t) => {
  const f = fixture(t);
  const broken = createInstallationFailureReporter({ ...f, secret: "fixture-secret", request: async () => { throw new Error("offline"); } });
  await assert.rejects(broken.tick()); assert.equal(f.store.read(f.id).failureReportedAt, undefined);
  const restored = createInstallationFailureReporter({ ...f, secret: "fixture-secret", request: async (_url, input) => {
    assert.equal(input.redirect, "error"); assert.equal(JSON.parse(input.body).failures[0].id, f.id);
    return new Response(JSON.stringify({ acknowledged: [f.id, randomUUID()] }));
  } });
  await restored.tick(); assert.ok(f.store.read(f.id).failureReportedAt);
  let calls = 0;
  await createInstallationFailureReporter({ ...f, secret: "fixture-secret", request: async () => { calls++; } }).tick();
  assert.equal(calls, 0);
});
test("only acknowledged failed jobs are marked; credentials and raw URLs are omitted", async (t) => {
  const f = fixture(t), other = randomUUID();
  f.store.write({ ...f.store.read(f.id), message: "password=never-send-this" });
  f.store.write({ id: other, key: "unturned", action: "rollback", status: "interrupted", createdAt: 2, message: "Failed https://example.test/private" });
  const reporter = createInstallationFailureReporter({ ...f, secret: "fixture-secret", request: async (_url, input) => {
    assert.doesNotMatch(input.body, /never-send-this|example\.test/);
    return new Response(JSON.stringify({ acknowledged: [f.id] }));
  } });
  await reporter.tick(); assert.ok(f.store.read(f.id).failureReportedAt);
  assert.equal(f.store.read(other).failureReportedAt, undefined);
});
test("concurrent polling and the 15-minute backoff bound failed delivery attempts", async (t) => {
  const f = fixture(t); let calls = 0, clock = 1;
  const reporter = createInstallationFailureReporter({ ...f, secret: "fixture-secret", now: () => clock, request: async () => { calls++; return new Response("unavailable", { status: 503 }); } });
  await Promise.allSettled([reporter.tick(), reporter.tick()]); await reporter.tick(); assert.equal(calls, 1);
  clock += 15 * 60_000; await assert.rejects(reporter.tick()); assert.equal(calls, 2);
});
