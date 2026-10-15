import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { resourceScope, runCustomerGate } from "./customerRuntime.js";
import { customerResourceLimits } from "./customerResourceLimits.js";

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

test("explicit allocations reach placement unchanged and cannot relax task/swap policy", async () => {
  const limits = { cpuMillis: 500, memoryMiB: 1536 };
  let placed;
  assert.equal(await runCustomerGate({ ...input, plan: { ...input.plan, resourceLimits: limits } }, {
    pid: 42, onSignal: () => {}, place: async (...args) => { placed = args; }, launch: () => {
      const child = new EventEmitter(); setImmediate(() => child.emit("exit", 0)); return child;
    },
  }), 0);
  assert.deepEqual(placed, [id, "teeworlds", 42, limits]);
  for (const bad of [null, [], { ...limits, cpuMillis: 249 }, { ...limits, cpuMillis: 6001 }, { ...limits, memoryMiB: 8193 }, { ...limits, memoryMiB: 255 }, { ...limits, cpuMillis: "500" }, { ...limits, tasks: 1000 }, { ...limits, swap: 1 }]) {
    await assert.rejects(runCustomerGate({ ...input, plan: { ...input.plan, resourceLimits: bad } }, { pid: 42, place: async () => assert.fail("invalid allocation reached helper") }));
  }
  assert.deepEqual(customerResourceLimits("luanti"), { cpuMillis: 2000, memoryMiB: 2048 });
});

test("identity handoff is explicit, follows confirmed placement and cannot fall back", async () => {
  const plan = { ...input.plan, identityProfile: "teeworlds-unix-v1", identityRuntime: { port: 8322, config: "fixture" } };
  const events = [];
  await assert.rejects(runCustomerGate({ ...input, plan }, { pid: 42, onSignal: () => {}, place: async () => events.push("placed"), identityLaunch: () => { events.push("identity"); throw Error("denied"); }, launch: () => assert.fail("unrestricted fallback") }), /denied/);
  assert.deepEqual(events, ["placed", "identity"]);
  await assert.rejects(runCustomerGate({ ...input, plan: { ...plan, identityProfile: "other" } }, { pid: 42, place: () => assert.fail("invalid profile reached placement") }), /identity profile/);
});

test("identity cancellation exits the unprivileged gate even when it cannot signal the root supervisor", async () => {
  const handlers = {};
  let unreferenced = false;
  const plan = { ...input.plan, identityProfile: "teeworlds-unix-v1" };
  const result = await runCustomerGate({ ...input, plan }, {
    pid: 42, onSignal: (name, handler) => { handlers[name] = handler; }, place: async () => {},
    identityLaunch: () => {
      const child = new EventEmitter();
      child.kill = () => { throw Error("EPERM"); };
      child.unref = () => { unreferenced = true; };
      setImmediate(() => handlers.SIGTERM());
      return child;
    },
  });
  assert.equal(result, 143);
  assert.equal(unreferenced, true);
});
