/** The detached, unprivileged runtime gate. No game executes before cgroup
 * placement succeeds. The gate and all descendants share one process group. */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { processIdentity } from "./managedRegistry.js";

const runFile = promisify(execFile);
export const CUSTOMER_RESOURCE_HELPER = "/usr/local/libexec/playbound-customer-resources";
const GAMES = ["teeworlds", "bzflag", "hedgewars", "openttd", "luanti"];

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

export async function enterCustomerResources(id, gameSlug, pid = process.pid) {
  const identity = processIdentity(pid);
  if (!identity || !GAMES.includes(gameSlug)) throw new Error("Unsupported resource placement");
  const scope = resourceScope(id, pid);
  const { stdout } = await runFile("/usr/bin/sudo", ["-n", CUSTOMER_RESOURCE_HELPER, "attach", id, gameSlug, String(pid), identity], {
    timeout: 8000, maxBuffer: 4096, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
  });
  const result = JSON.parse(stdout);
  if (result.scope !== scope || result.attached !== true) throw new Error("Resource placement was not confirmed");
  return result;
}

export async function runCustomerGate(input, { place = enterCustomerResources, launch = spawn, pid = process.pid, onSignal = (name, handler) => process.on(name, handler) } = {}) {
  const { id, gameSlug, plan } = input || {};
  resourceScope(id, pid);
  if (!GAMES.includes(gameSlug) || plan?.binary !== "/usr/bin/prlimit" || !Array.isArray(plan.args) || plan.args.length > 128 || plan.args.some(value => typeof value !== "string" || value.includes("\0")) || typeof plan.cwd !== "string" || !plan.env || typeof plan.env !== "object") throw new Error("Invalid customer runtime plan");
  let stopping = false, child;
  const stop = () => { stopping = true; if (child) child.kill("SIGTERM"); };
  onSignal("SIGTERM", stop);
  onSignal("SIGINT", stop);
  await place(id, gameSlug, pid);
  if (stopping) return 143;
  child = launch(plan.binary, plan.args, { cwd: plan.cwd, env: plan.env, stdio: ["ignore", "inherit", "inherit"] });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => resolve(Number.isInteger(code) ? code : 1));
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
