import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const ANIV_HELPER = "/usr/local/libexec/playbound-aniv-host";
const runFile = promisify(execFile);
export function anivDirectory(id, root = "/var/lib/playbound-host/aneurism-iv-servers") {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) throw new Error("Invalid ANEURISM server identity");
  return path.join(root, `pb-${createHash("sha256").update(id).digest("hex").slice(0, 24)}`);
}
export function anivStatus(room) {
  try {
    const status = JSON.parse(fs.readFileSync(path.join(room.cwd, "aniv-status.json"), "utf8"));
    if (status.pid !== room.pid || !Number.isFinite(status.updatedAt) || Date.now()-status.updatedAt > 8000 || status.updatedAt > Date.now()+2000) return null;
    return status;
  } catch { return null; }
}
export async function waitForAniv(room, child, timeoutMs = 210000) {
  const deadline = Date.now()+timeoutMs;
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
    const state = anivStatus(room);
    if (state?.error) return false;
    if (state?.ready === true && /^\d{17}$/.test(state.steamServerId || "")) return true;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return false;
}
export async function queryAnivOccupancy(room) {
  if (anivStatus(room)?.ready !== true || !room.communityServerId || !Number.isInteger(room.port)) return null;
  try {
    const { stdout } = await runFile("/usr/bin/sudo", ["-n", ANIV_HELPER, "query", String(room.port), room.communityServerId], {timeout:6500,maxBuffer:4096});
    const count = JSON.parse(stdout);
    if (!count || !Number.isInteger(count.players) || count.players < 0 || !Number.isInteger(count.maxPlayers) || count.maxPlayers < 2 || count.maxPlayers > 60 || count.players > count.maxPlayers || !Number.isInteger(count.bots) || count.bots < 0 || count.players + count.bots > count.maxPlayers) return null;
    return {players:count.players,maxPlayers:count.maxPlayers,bots:count.bots};
  } catch { return null; }
}

export async function queryAnivLogs(id) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error("Invalid server identity");
  // Log identity is its fixed hash, independent of the current network slot.
  const { stdout } = await runFile("/usr/bin/sudo", ["-n", ANIV_HELPER, "logs", "27700", id], { timeout: 3500, maxBuffer: 512 * 1024 });
  const data = JSON.parse(stdout);
  if (typeof data?.available !== "boolean" || typeof data.truncated !== "boolean" || !Array.isArray(data.lines) || data.lines.length > 200 || data.lines.some(line => typeof line !== "string") || data.lines.join("\n").length > 80_000) throw new Error("Invalid ANEURISM log snapshot");
  return { available: data.available, truncated: data.truncated, lines: data.lines };
}

export async function retainAnivLogs() {
  const { stdout } = await runFile("/usr/bin/sudo", ["-n", ANIV_HELPER, "retain-logs", "27700", "maintenance"], { timeout: 3500, maxBuffer: 4096 });
  const data = JSON.parse(stdout);
  if (!Number.isInteger(data?.trimmed) || data.trimmed < 0) throw new Error("Invalid ANEURISM log retention response");
  return data.trimmed;
}
export function spawnAniv(port, ctx, options) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "run", String(port), ctx.partyId], {
    ...options, detached: true, stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(JSON.stringify({name:ctx.name, maxPlayers:ctx.settings.maxPlayers || 4, map:ctx.settings.map || "aneurismiv"})+"\n");
  return child;
}

async function supervise() {
  const slot = process.argv[3], id = process.argv[4];
  if (!/^277(?:0\d|1[0-5])$/.test(slot || "")) throw new Error("Invalid ANEURISM isolation slot");
  const directory = anivDirectory(id);
  let input = "";
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 4096) throw new Error("Server settings are too large"); }
  const helper = spawn("/usr/bin/sudo", ["-n", ANIV_HELPER, "run", slot, id], {stdio:["pipe","pipe","pipe"]});
  helper.stdin.end(input);
  let pending = "";
  let stopping = false;
  const write = state => {
    const file = path.join(directory, "aniv-status.json");
    fs.writeFileSync(file+".tmp", JSON.stringify({...state,pid:process.pid,updatedAt:Date.now()}), {mode:0o600});
    fs.renameSync(file+".tmp",file);
  };
  helper.stdout.on("data", chunk => {
    pending += chunk;
    const lines = pending.split("\n"); pending = lines.pop();
    for (const line of lines) {
      try { const state = JSON.parse(line); write(state); if(state.error) console.error(state.error); }
      catch { write({ready:false,error:"Invalid ANEURISM supervisor status"}); }
    }
  });
  // Sudo errors contain helper paths only. Native output never reaches this pipe.
  helper.stderr.on("data", () => write({ready:false,error:"ANEURISM privileged helper unavailable"}));
  helper.on("error", () => {write({ready:false,error:"ANEURISM supervisor could not start"});process.exitCode=1;});
  const stop = () => {
    if (stopping) return; stopping = true;
    // Covers cancellation before the helper has written its slot manifest.
    helper.kill("SIGTERM");
    const request = spawn("/usr/bin/sudo", ["-n",ANIV_HELPER,"stop",slot,id], {stdio:"ignore"});
    request.on("error",()=>{});
  };
  process.on("SIGTERM",stop); process.on("SIGINT",stop);
  helper.on("exit", code => {write({ready:false});process.exitCode=code || 0;});
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "run") {
  supervise().catch(()=>{console.error("ANEURISM supervisor failed to start");process.exitCode=1;});
}
