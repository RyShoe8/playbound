/**
 * The rule this file exists to keep: everything sent to the renderer must
 * survive structured clone.
 *
 * `structuredClone` is the same algorithm Electron uses on the IPC boundary,
 * so cloning the snapshot here fails for exactly the payloads Electron would
 * have dropped. This is the only cheap way to catch it: Electron does not
 * throw when a payload cannot be serialized, it logs and moves on, so the
 * failure shows up as a UI that has simply stopped updating.
 *
 * Run: node services/installQueueView.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const { toQueueSnapshot, taskView } = require("./installQueueView.js");

function makeTask(over = {}) {
  const task = {
    id: "supertuxkart",
    slug: "supertuxkart",
    editionSlug: null,
    title: "SuperTuxKart",
    coverImage: null,
    status: "active",
    phase: "downloading",
    message: "Installing SuperTuxKart…",
    received: 1024,
    total: 4096,
    pct: 25,
    startedAt: 1,
    cancelled: false,
    // The three that cannot cross IPC.
    abortController: new AbortController(),
    ...over,
  };
  task.finished = new Promise(() => {});
  task.releaseQueue = () => {};
  return task;
}

test("a snapshot of a live task can cross the IPC boundary", () => {
  const active = makeTask();
  const snapshot = toQueueSnapshot({ activeTask: active, tasks: [active, makeTask({ id: "b", slug: "b" })] });
  assert.doesNotThrow(() => structuredClone(snapshot));
});

test("the live machinery is not on the wire shape", () => {
  const view = taskView(makeTask());
  assert.equal(view.finished, undefined);
  assert.equal(view.releaseQueue, undefined);
  assert.equal(view.abortController, undefined);
});

test("what the status bar reads is carried through", () => {
  const view = taskView(makeTask({ bytesPerSecond: 900, etaMs: 4000, phaseStartedAt: 7 }));
  assert.equal(view.title, "SuperTuxKart");
  assert.equal(view.pct, 25);
  assert.equal(view.phase, "downloading");
  assert.equal(view.bytesPerSecond, 900);
  assert.equal(view.etaMs, 4000);
  assert.equal(view.phaseStartedAt, 7);
});

test("a task waiting on the queue chain is counted, whatever its status says", () => {
  /*
   * The first install of a session is created with status "active" before it
   * has actually started. If something ahead of it in the chain never
   * finishes it sits there — and while the old filter looked at the status
   * string, it was invisible: no queue pill, and no way to cancel it or the
   * install blocking it.
   */
  const running = makeTask({ id: "a", slug: "a" });
  const waiting = makeTask({ id: "b", slug: "b", status: "active" });
  const snapshot = toQueueSnapshot({ activeTask: running, tasks: [running, waiting] });
  assert.equal(snapshot.totalCount, 2);
  assert.deepEqual(snapshot.queued.map((q) => q.slug), ["b"]);
  assert.equal(snapshot.queued[0].queuePosition, 1);
});

test("nothing running and nothing queued is an empty queue", () => {
  const snapshot = toQueueSnapshot({ activeTask: null, tasks: [] });
  assert.equal(snapshot.active, null);
  assert.equal(snapshot.totalCount, 0);
});

test("main.js builds its snapshot here rather than spreading the task", () => {
  // The bug was a `{ ...task }` in getInstallQueueSnapshot. Assert it is gone,
  // so the promise and the release function cannot creep back onto the wire.
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const start = src.indexOf("function getInstallQueueSnapshot(");
  assert.notEqual(start, -1, "getInstallQueueSnapshot is gone from main.js");
  const body = src.slice(start, src.indexOf("\n}", start));
  assert.match(body, /toQueueSnapshot\(/, "the snapshot must come from this module");
  assert.doesNotMatch(body, /\.\.\.(t|task|activeInstallTask)\b/, "a spread task puts IPC-hostile fields on the wire");
});
