import { Worker } from "node:worker_threads";

const FUNCTIONS = new Set(["createWorldBackup", "listWorldBackups", "restoreWorldBackup"]);

/** Run one world-backup operation in a worker thread. Resolves to the result; rejects with a safe message. */
export function runWorldBackup(fn, args) {
  if (!FUNCTIONS.has(fn)) return Promise.reject(new Error("Unknown world-backup operation"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./dedicatedDataBackupsWorker.js", import.meta.url), { workerData: { fn, args } });
    let settled = false;
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      settle(value);
    };
    worker.once("message", (message) => finish(message.ok ? resolve : reject, message.ok ? message.result : new Error(message.error)));
    worker.once("error", () => finish(reject, new Error("The world-data backup could not run on the host.")));
    worker.once("exit", (code) => { if (code !== 0) finish(reject, new Error("The world-data backup could not run on the host.")); });
  });
}
