/**
 * What the renderer is allowed to be told about an install.
 *
 * An install task is a live object: it owns an AbortController, the promise
 * the queue chains on, and the function that releases it. None of that can
 * cross an IPC boundary — Electron serializes with structured clone, and a
 * promise or a function in the payload makes `webContents.send` fail. It does
 * not throw. It logs "Failed to serialize arguments" to the main process and
 * the message is simply never delivered.
 *
 * That is what made the whole install UI go quiet: the snapshot spread the
 * task object, so every `progress` and `install-queue-updated` event carrying
 * a queue was dropped in flight. The queue pill never appeared, nothing could
 * be cancelled, and an install that was running perfectly well looked hung.
 *
 * So the wire shape is built by hand here, from named fields, rather than by
 * spreading whatever the task happens to hold. A field the renderer needs has
 * to be added deliberately, and anything else on the task stays in the main
 * process where it belongs.
 *
 * Run: node services/installQueueView.test.js
 */

/**
 * Every field the renderer reads, and nothing else.
 *
 * `phaseStartedAt` is what the elapsed-time ticker counts from; `pct`,
 * `bytesPerSecond` and `etaMs` are the download meter; the rest is identity
 * and labelling.
 */
const TASK_VIEW_FIELDS = [
  "id",
  "slug",
  "editionSlug",
  "title",
  "coverImage",
  "status",
  "phase",
  "message",
  "addon",
  "received",
  "total",
  "pct",
  "bytesPerSecond",
  "etaMs",
  "startedAt",
  "phaseStartedAt",
  "cancelled",
];

function taskView(task, extra) {
  if (!task) return null;
  const view = {};
  for (const field of TASK_VIEW_FIELDS) {
    if (task[field] !== undefined) view[field] = task[field];
  }
  return extra ? { ...view, ...extra } : view;
}

/**
 * The queue as the status bar sees it.
 *
 * Waiting is decided by identity, not by the `status` string. A task created
 * while nothing was running is marked "active" the moment it is made, but it
 * is not actually running until it clears the queue chain — and filtering on
 * `status === "queued"` left that task invisible: no pill, no count, and no
 * way to cancel the install that was blocking it. Anything in the queue that
 * is not the running task is waiting, whatever it calls itself.
 */
function toQueueSnapshot({ activeTask = null, tasks = [] } = {}) {
  const waiting = tasks.filter((t) => t && t !== activeTask);
  const queued = waiting.map((t, idx) => taskView(t, { queuePosition: idx + 1 }));
  return {
    active: taskView(activeTask),
    queued,
    totalCount: (activeTask ? 1 : 0) + queued.length,
  };
}

module.exports = { toQueueSnapshot, taskView, TASK_VIEW_FIELDS };
