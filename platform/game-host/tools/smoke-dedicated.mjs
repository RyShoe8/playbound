#!/usr/bin/env node
// Run one draft recipe under a disposable HOME without restarting the live agent.
// Usage: node smoke-dedicated.mjs <slug> [seconds]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { createDedicatedRecipes } from "../dedicatedRecipes.js";

const slug = process.argv[2];
const seconds = Math.min(300, Math.max(10, Number(process.argv[3]) || 45));
const GAMES_ROOT = process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games";
const HOST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), `pb-paid-${slug || "unknown"}-`));
const firstExisting = (paths) => paths.find((candidate) => fs.existsSync(candidate)) || null;
const gameBin = (game, names) => names.map((name) => path.join(GAMES_ROOT, game, name));
const customerHomeDir = (name, ctx) => {
  const dir = path.join(HOST_HOME, name, `pb-${ctx.partyId}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
};
const isolatedHomeEnv = (name) => (_port, ctx) => ({ HOME: customerHomeDir(name, ctx) });
const recipes = createDedicatedRecipes({
  fs, path, execFile: promisify(execFileCallback), GAMES_ROOT, HOST_HOME,
  gameBin, firstExisting, customerHomeDir, isolatedHomeEnv,
  managedPlayerLimit: (ctx) => Number(ctx.settings.maxPlayers) || 4,
});
const recipe = recipes[slug];
if (!recipe) throw new Error(`No paid recipe for ${slug}`);
const ctx = { customerOwned: true, partyId: randomBytes(12).toString("hex"), name: "PlayBound internal smoke", settings: { maxPlayers: 4 } };
const port = recipe.portStart;
const initial = recipe.resolveBinary ? recipe.resolveBinary(recipe.binaries, ctx) : firstExisting(recipe.binaries);
if (!initial) throw new Error(`No server binary for ${slug}`);
await recipe.prepareSpawn?.(port, ctx);
const binary = recipe.resolveBinary ? recipe.resolveBinary(recipe.binaries, ctx) : initial;
if (!binary) throw new Error(`No prepared binary for ${slug}`);
const args = recipe.args(port, ctx, binary);
const cwd = typeof recipe.cwd === "function" ? recipe.cwd(port, ctx) : recipe.cwd || path.dirname(binary);
const child = spawn(binary, args, {
  cwd, env: { ...process.env, ...recipe.spawnEnv?.(port, ctx) },
  stdio: ["pipe", "pipe", "pipe"], detached: true,
});
console.log(JSON.stringify({ slug, binary, cwd, port, pid: child.pid, home: HOST_HOME }));
let output = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => {
  output = (output + String(data)).slice(-16000);
});
const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
const outcome = await Promise.race([
  exited,
  new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), seconds * 1000)),
]);
if (outcome.timedOut) {
  try {
    if (recipe.shutdownCommand && child.stdin.writable) child.stdin.write(recipe.shutdownCommand);
    else process.kill(-child.pid, "SIGINT");
  } catch { /* already exited */ }
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already exited */ }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ }
    }
  }
}
console.log(output.slice(-4000));
console.log(JSON.stringify({ outcome, dataDir: HOST_HOME }));
