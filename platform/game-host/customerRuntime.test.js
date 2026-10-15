import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { resourceScope, runCustomerGate } from "./customerRuntime.js";

const id = "0123456789abcdef01234567";
const input = { id, gameSlug: "teeworlds", plan: { binary: "/usr/bin/prlimit", args: ["--core=0"], cwd: "/fixture", env: { PATH: "/usr/bin" } } };
test("resource identities select only fixed per-runtime scope names", () => {
  assert.equal(resourceScope(id, 42), `playbound-customer-${id}-42.scope`);
  for (const value of ["../other", "x.scope", null]) assert.throws(() => resourceScope(value, 42));
  assert.throws(() => resourceScope(id, 1));
});
test("a failed placement never executes a game or an unrestricted fallback", async () => {
  let launches = 0;
  await assert.rejects(runCustomerGate(input, { pid: 42, onSignal: () => {}, place: async () => { throw new Error("denied"); }, launch: () => { launches++; } }), /denied/);
  assert.equal(launches, 0);
});
test("stop during placement cannot start the game afterward", async () => {
  const handlers = {};
  let launches = 0;
  const result = await runCustomerGate(input, { pid: 42, onSignal: (name, handler) => { handlers[name] = handler; }, place: async () => { handlers.SIGTERM(); }, launch: () => { launches++; } });
  assert.equal(result, 143);
  assert.equal(launches, 0);
});
test("placement precedes launch and the gate returns the actual game exit status", async () => {
  const events = [];
  const result = await runCustomerGate(input, { pid: 42, onSignal: () => {}, place: async () => { events.push("placed"); }, launch: (binary, args, options) => {
    events.push("launched");
    assert.equal(binary, input.plan.binary);
    assert.equal(options.detached, undefined); // Inherit the gate's process group.
    const child = new EventEmitter();
    setImmediate(() => child.emit("exit", 7));
    return child;
  } });
  assert.equal(result, 7);
  assert.deepEqual(events, ["placed", "launched"]);
});
test("malformed or unreviewed plans are rejected before privileged placement", async () => {
  let calls = 0;
  for (const invalid of [{ ...input, gameSlug: "other" }, { ...input, plan: { ...input.plan, binary: "/bin/sh" } }, { ...input, plan: { ...input.plan, args: ["bad\0argument"] } }]) {
    await assert.rejects(runCustomerGate(invalid, { pid: 42, place: async () => { calls++; } }));
  }
  assert.equal(calls, 0);
});
