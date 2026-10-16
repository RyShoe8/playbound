import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";

const FUNCTIONS = new Set(["createWorldBackup", "listWorldBackups", "restoreWorldBackup"]);
const ISOLATED_DATA_GAMES = new Set(["teeworlds","bzflag","hedgewars","openttd","luanti","openarena","battle-for-wesnoth","supertuxkart","0-ad","ysoccer","flightgear","mindustry","hurry-curry","assaultcube","xonotic","wolfenstein-enemy-territory","medal-of-honor-allied-assault","freedoom","freeciv","warzone-2100","hypersomnia"]);

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


/** Root derives the private world from the activated identity journal. */
export async function runIsolatedWorldBackup(fn, args, execute = promisify(execFile)) {
  const actions = { createWorldBackup: "create", listWorldBackups: "list", restoreWorldBackup: "restore" };
  const [id, game, third, fourth] = args;
  if (!Object.hasOwn(actions, fn) || !/^[a-f0-9]{24}$/.test(id || "") || !ISOLATED_DATA_GAMES.has(game)) throw new Error("Invalid isolated snapshot request");
  const action = actions[fn], parameters = [action,id];
  if (action === "restore") {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(third || "")) throw new Error("Invalid isolated snapshot identity");
    parameters.push(third);
    if (fourth !== undefined && (!Number.isInteger(fourth) || fourth < 1 || fourth > 50)) throw new Error("Invalid backup retention");
  } else if (action === "create") {
    const retention = third ?? 3;
    if (!Number.isInteger(retention) || retention < 1 || retention > 50) throw new Error("Invalid backup retention");
    parameters.push(String(retention));
  }
  try {
    const {stdout} = await execute("/usr/bin/sudo", ["-n","/usr/local/libexec/playbound-customer-world-backups",...parameters], {
      timeout: 120000, maxBuffer: 1024 * 1024, env: {PATH:"/usr/bin:/bin",LANG:"C.UTF-8"},
    });
    const result = JSON.parse(stdout);
    const rows = action === "list" ? result : [result];
    if (!Array.isArray(rows) || rows.some(row => row.gameSlug !== game)) throw new Error("Snapshot game identity mismatch");
    return result;
  } catch {
    throw new Error("Isolated world snapshot failed. Stop the server before creating or restoring a snapshot; an interrupted restore needs operator recovery.");
  }
}


export async function runIsolatedFileOperation(id, game, input, execute = execFile) {
  if (!/^[a-f0-9]{24}$/.test(id || "") || !ISOLATED_DATA_GAMES.has(game) || !input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid isolated file request");
  const body = JSON.stringify(input);
  if (Buffer.byteLength(body) > 4 * 1024 ** 2 + 4096) throw new Error("File request exceeds limit");
  return new Promise((resolve,reject) => {
    const child = execute("/usr/bin/sudo",["-n","/usr/local/libexec/playbound-customer-world-backups","files",id], {
      timeout:35000,maxBuffer:6*1024**2,env:{PATH:"/usr/bin:/bin",LANG:"C.UTF-8"},
    },(error,stdout)=>{
      if (error) { reject(new Error("Stop the server before managing its isolated world files. An interrupted restore needs operator recovery."));return; }
      try {
        const data=JSON.parse(stdout);
        if (data.gameSlug !== game) throw new Error("File response game identity mismatch");
        if (data.ok !== true) throw new Error(data.error || "The file operation failed.");
        resolve(data.result);
      } catch (failure) { reject(new Error(failure.message || "The file operation failed.")); }
    });
    child.stdin.on("error",()=>{});
    child.stdin.end(body);
  });
}
