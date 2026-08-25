/**
 * Probe installed dedicated binary versions (cached for /health).
 *
 * Games whose --version flag spawns a heavyweight engine (OpenRA/Mono,
 * Veloren Rust server, .NET hosts) are excluded — they hang at 100%+ CPU.
 */

import { spawn } from "node:child_process";
import { resolveRecipe } from "./recipes.js";

const CACHE_MS = 10 * 60 * 1000;
/** @type {Record<string, string | null>} */
let cache = {};
let cacheAt = 0;
let refreshInFlight = null;

/**
 * slug → argv suffix for a short version string.
 *
 * EXCLUDED (spawn heavyweight engines that hang):
 *   re-volt-rvgl, openhv, veloren, gemrb, space-station-14,
 *   chris-sawyers-locomotion, renegade-x
 */
const PROBES = {
  freeciv: { args: ["-v"], pick: pickFreeciv },
  openttd: { args: ["--version"], pick: pickFirstVersion },
  luanti: { args: ["--version"], pick: pickFirstVersion },
  hedgewars: { args: ["--version"], pick: pickFirstVersion },
  "warzone-2100": { args: ["--version"], pick: pickFirstVersion },
  bzflag: { args: ["-v"], pick: pickFirstVersion },
  supertuxkart: { args: ["--version"], pick: pickFirstVersion },
  xonotic: { args: ["+version"], pick: pickFirstVersion },
  openarena: { args: ["+version"], pick: pickFirstVersion },
  "0-ad": { args: ["-version"], pick: pickFirstVersion },
  openra: { args: ["--version"], pick: pickFirstVersion },
  unvanquished: { args: ["-v"], pick: pickFirstVersion },
  "battle-for-wesnoth": { args: ["--version"], pick: pickFirstVersion },
  flightgear: { args: ["--version"], pick: pickFirstVersion },
  "team-fortress-2": { args: ["-version"], pick: pickFirstVersion },
  "counter-strike-2": { args: ["-version"], pick: pickFirstVersion },
  freedoom: { args: ["-v"], pick: pickFirstVersion },
};

function looksLikeVersion(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 32) return false;
  if (/error|exception|unrecognized|permission denied|invalid option|unhandled|console mode|gamedir|user error|bwrap|fatal/i.test(s)) {
    return false;
  }
  return /\d+\.\d+/.test(s);
}

function pickFirstVersion(text) {
  const line = String(text || "")
    .trim()
    .split(/\r?\n/)
    .find(Boolean);
  if (!line) return null;
  const m =
    line.match(/(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/) ||
    line.match(/release[-_]?(\d{8}|\d+\.\d+)/i);
  const picked = m ? m[1] || m[0] : null;
  return looksLikeVersion(picked) ? picked : null;
}

function pickFreeciv(text) {
  const raw = String(text || "");
  const m =
    raw.match(/freeciv[^\d]*(\d+\.\d+(?:\.\d+)?)/i) ||
    raw.match(/(?:^|\s)(\d+\.\d+(?:\.\d+)?)(?:\s|$)/m);
  return m?.[1] || null;
}

/**
 * Spawn the binary with detached: true so we can kill the entire process
 * group when the timeout fires — preventing orphan engine threads from
 * consuming CPU indefinitely.
 */
async function probeBinary(slug, binary) {
  const probe = PROBES[slug];
  if (!probe) return null;
  const TIMEOUT_MS = 6000;
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(binary, probe.args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy" },
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Kill entire process group
      const pid = child.pid;
      if (pid) {
        try { process.kill(-pid, "SIGKILL"); } catch { /* already dead */ }
      }
      try { child.kill("SIGKILL"); } catch { /* already dead */ }
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), TIMEOUT_MS);

    child.stdout?.on("data", (buf) => { stdout += buf; });
    child.stderr?.on("data", (buf) => { stderr += buf; });
    child.on("error", () => finish(null));
    child.on("exit", () => {
      const text = `${stdout}\n${stderr}`;
      finish(probe.pick(text) || null);
    });
  });
}

async function refreshGameVersions() {
  const out = {};
  for (const slug of Object.keys(PROBES)) {
    const resolved = resolveRecipe(slug);
    const binary = resolved?.binary || null;
    out[slug] = binary ? await probeBinary(slug, binary) : null;
  }
  cache = out;
  cacheAt = Date.now();
  return out;
}

export function getCachedGameVersions() {
  if (Date.now() - cacheAt > CACHE_MS && !refreshInFlight) {
    refreshInFlight = refreshGameVersions()
      .catch((err) => {
        console.warn("[gameVersions] refresh failed:", err?.message || err);
        return cache;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return { versions: { ...cache }, cachedAt: cacheAt || null };
}

/** Force refresh after install/ensure (best-effort). */
export function scheduleGameVersionRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = refreshGameVersions()
      .catch(() => cache)
      .finally(() => {
        refreshInFlight = null;
      });
  }
}

void refreshGameVersions().catch((err) => {
  console.warn("[gameVersions] initial refresh failed:", err?.message || err);
});
