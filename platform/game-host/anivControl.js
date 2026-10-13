import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ANIV_HELPER = "/usr/local/libexec/playbound-aniv-host";
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
