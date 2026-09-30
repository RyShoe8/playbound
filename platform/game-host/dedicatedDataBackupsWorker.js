import { parentPort, workerData } from "node:worker_threads";
import * as backups from "./dedicatedDataBackups.js";

// The copy is synchronous file work of up to several GB. It runs here, off the
// agent's event loop, so a large backup can never stall every running room.
try {
  const result = backups[workerData.fn](...workerData.args);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  // Filesystem errors carry host paths; only PlayBound's own messages are passed on.
  const message = error && typeof error === "object" && "code" in error
    ? "The host could not read or write this server's world data."
    : String(error?.message || error);
  parentPort.postMessage({ ok: false, error: message });
}
