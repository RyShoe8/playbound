/** The detached, unprivileged runtime gate. No game executes before cgroup
 * placement succeeds. The gate and all descendants share one process group. */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { processIdentity } from "./managedRegistry.js";
import { customerResourceLimits } from "./customerResourceLimits.js";

const runFile = promisify(execFile);
export const CUSTOMER_RESOURCE_HELPER = "/usr/local/libexec/playbound-customer-resources";
const IDENTITY_HELPER = "/usr/local/libexec/playbound-customer-runtime";
const GAMES = ["teeworlds", "bzflag", "hedgewars", "openttd", "luanti", "openarena", "battle-for-wesnoth", "supertuxkart", "0-ad", "ysoccer", "flightgear", "mindustry"];

export function resourceScope(id, pid) {
  if (!/^[a-f0-9]{24}$/i.test(id || "") || !Number.isInteger(pid) || pid <= 1) throw new Error("Invalid resource identity");
  return `playbound-customer-${id.toLowerCase()}-${pid}.scope`;
}

export function spawnCustomerRuntime(plan, id, gameSlug, outputFd) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "run"], {
    cwd: plan.cwd, env: plan.env, detached: true, stdio: ["pipe", outputFd, outputFd],
  });
  // A failed gate may close before accepting input. Its exit/startup status is
  // authoritative; an EPIPE must not crash the control agent.
  child.stdin.on("error", () => {});
  child.stdin.end(JSON.stringify({ id, gameSlug, plan }) + "\n");
  return child;
}

export async function enterCustomerResources(id, gameSlug, pid = process.pid, allocation) {
  const identity = processIdentity(pid);
  if (!identity || !GAMES.includes(gameSlug)) throw new Error("Unsupported resource placement");
  const scope = resourceScope(id, pid);
  const limits = customerResourceLimits(gameSlug, allocation);
  const { stdout } = await runFile("/usr/bin/sudo", ["-n", CUSTOMER_RESOURCE_HELPER, "attach", id, gameSlug, String(pid), identity, String(limits.cpuMillis), String(limits.memoryMiB)], {
    timeout: 8000, maxBuffer: 4096, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
  });
  const result = JSON.parse(stdout);
  if (result.scope !== scope || result.attached !== true || result.cpuCores * 1000 !== limits.cpuMillis || result.ramBytes !== limits.memoryMiB * 1024 ** 2) throw new Error("Resource placement was not confirmed");
  return result;
}

export function launchIdentityRuntime(id, pid, plan) {
  const identity = processIdentity(pid);
  const game = plan.identityRuntime?.gameSlug || "teeworlds";
  const ranges = { teeworlds: [8303,8323], bzflag: [5155,5174], hedgewars: [46631,46650], openttd: [3979,3999], luanti: [30000,30020], openarena: [27960,27980], "battle-for-wesnoth": [15000,15020], supertuxkart: [2759,2779], "0-ad": [20595,20595], ysoccer: [54555,54575], flightgear: [5000,5010], mindustry: [6567,6587] };
  if (!Object.hasOwn(ranges,game)) throw new Error("Invalid identity game");
  const limits = customerResourceLimits(game, plan.resourceLimits);
  if (!identity || plan.identityProfile !== `${game}-unix-v1` || !Number.isInteger(plan.identityRuntime?.port) || plan.identityRuntime.port < ranges[game][0] || plan.identityRuntime.port > ranges[game][1] || typeof plan.identityRuntime.config !== "string" || Buffer.byteLength(plan.identityRuntime.config) > 16384) throw new Error("Invalid identity handoff");
  const child = spawn("/usr/bin/sudo", ["-n", IDENTITY_HELPER, game === "teeworlds" ? "run" : "run-native", id, String(pid), identity, ...(game === "teeworlds" ? [] : [game]), String(plan.identityRuntime.port), String(limits.cpuMillis), String(limits.memoryMiB)], { cwd: "/", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" }, stdio: ["pipe", "inherit", "inherit"] });
  child.stdin.on("error", () => {});
  child.stdin.end(plan.identityRuntime.config);
  return child;
}

async function identityOperation(action, room) {
  resourceScope(room.communityServerId, room.pid);
  if (!room.processIdentity || !["teeworlds-unix-v1","bzflag-unix-v1","hedgewars-unix-v1","openttd-unix-v1","luanti-unix-v1","openarena-unix-v1","battle-for-wesnoth-unix-v1","supertuxkart-unix-v1","0-ad-unix-v1","ysoccer-unix-v1","flightgear-unix-v1","mindustry-unix-v1"].includes(room.identityProfile)) throw new Error("Invalid identity operation");
  const { stdout } = await runFile("/usr/bin/sudo", ["-n", IDENTITY_HELPER, action, room.communityServerId, String(room.pid), room.processIdentity], { timeout: 4000, maxBuffer: 4096, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
  return JSON.parse(stdout);
}
export async function stopIdentityRuntime(room) {
  try { return (await identityOperation("stop", room)).stopped === true; } catch { return false; }
}
export async function identityRuntimeHealthy(room) {
  try {
    const result = await identityOperation("status", room);
    return result.running === true && (result.networkProfile || null) === (room.networkProfile || null);
  } catch { return false; }
}

export async function runCustomerGate(input, { place = enterCustomerResources, launch = spawn, identityLaunch = launchIdentityRuntime, pid = process.pid, onSignal = (name, handler) => process.on(name, handler) } = {}) {
  const { id, gameSlug, plan } = input || {};
  resourceScope(id, pid);
  if (!GAMES.includes(gameSlug) || plan?.binary !== "/usr/bin/prlimit" || !Array.isArray(plan.args) || plan.args.length > 128 || plan.args.some(value => typeof value !== "string" || value.includes("\0")) || typeof plan.cwd !== "string" || !plan.env || typeof plan.env !== "object") throw new Error("Invalid customer runtime plan");
  if (plan.identityProfile !== undefined && (!["teeworlds","bzflag","hedgewars","openttd","luanti","openarena","battle-for-wesnoth","supertuxkart","0-ad","ysoccer","flightgear","mindustry"].includes(gameSlug) || plan.identityProfile !== `${gameSlug}-unix-v1` || (gameSlug !== "teeworlds" && plan.identityRuntime?.gameSlug !== gameSlug))) throw new Error("Invalid identity profile");
  let stopping = false, child, finish;
  const stop = () => {
    stopping = true;
    if (child) {
      try { child.kill("SIGTERM"); } catch { /* The scoped root stop owns privileged descendants. */ }
      if (plan.identityProfile) {
        // Do not keep the gate alive waiting for a privileged child it cannot
        // signal. Gate exit independently fences that child, including when the
        // agent exits before its delayed fallback or the binding is not ready.
        child.unref();
        finish?.(143);
      }
    }
  };
  onSignal("SIGTERM", stop);
  onSignal("SIGINT", stop);
  const limits = customerResourceLimits(gameSlug, plan.resourceLimits);
  await place(id, gameSlug, pid, limits);
  if (stopping) return 143;
  child = plan.identityProfile ? identityLaunch(id, pid, plan) : launch(plan.binary, plan.args, { cwd: plan.cwd, env: plan.env, stdio: ["ignore", "inherit", "inherit"] });
  return new Promise((resolve, reject) => {
    finish = resolve;
    child.once("error", reject);
    child.once("exit", code => resolve(Number.isInteger(code) ? code : 1));
    if (stopping) stop();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "run") {
  (async () => {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 64 * 1024) throw new Error("Customer runtime plan too large");
    }
    process.exitCode = await runCustomerGate(JSON.parse(input));
  })().catch(() => { console.error("Customer resource placement or isolated runtime failed; no unrestricted fallback was attempted."); process.exitCode = 1; });
}
