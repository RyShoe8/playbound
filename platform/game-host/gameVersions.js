/**
 * Probe installed dedicated binary versions (cached for /health).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveRecipe } from "./recipes.js";

const execFileAsync = promisify(execFile);

const CACHE_MS = 10 * 60 * 1000;
/** @type {Record<string, string | null>} */
let cache = {};
let cacheAt = 0;
let refreshInFlight = null;

/** slug → argv suffix for a short version string */
const PROBES = {
  freeciv: { args: ["-v"], pick: pickFreeciv },
  openttd: { args: ["--version"], pick: pickFirstVersion },
  luanti: { args: ["--version"], pick: pickFirstVersion },
  minetest: { args: ["--version"], pick: pickFirstVersion },
  hedgewars: { args: ["--version"], pick: pickFirstVersion },
  "warzone-2100": { args: ["--version"], pick: pickFirstVersion },
  bzflag: { args: ["-v"], pick: pickFirstVersion },
  supertuxkart: { args: ["--version"], pick: pickFirstVersion },
  xonotic: { args: ["+version"], pick: pickFirstVersion },
  openarena: { args: ["+version"], pick: pickFirstVersion },
  "0-ad": { args: ["-version"], pick: pickFirstVersion },
  openra: { args: ["--version"], pick: pickFirstVersion },
  mrboom: { args: ["-v"], pick: pickFirstVersion },
};

function pickFirstVersion(text) {
  const line = String(text || "")
    .trim()
    .split(/\r?\n/)
    .find(Boolean);
  if (!line) return null;
  const m =
    line.match(/(\d+\.\d+(?:\.\d+)?(?:\.\d+)?)/) ||
    line.match(/release[-_]?(\d{8}|\d+\.\d+)/i);
  return m ? m[1] || m[0] : line.slice(0, 48);
}

function pickFreeciv(text) {
  const m = String(text || "").match(/(\d+\.\d+(?:\.\d+)?)/);
  return m?.[1] || pickFirstVersion(text);
}

async function probeBinary(slug, binary) {
  const probe = PROBES[slug];
  if (!probe) return null;
  try {
    const { stdout, stderr } = await execFileAsync(binary, probe.args, {
      timeout: 8000,
      maxBuffer: 64 * 1024,
    });
    return probe.pick(`${stdout}\n${stderr}`) || null;
  } catch (err) {
    const text = [err?.stdout, err?.stderr].filter(Boolean).join("\n");
    if (text) {
      const picked = probe.pick(text);
      if (picked) return picked;
    }
    return null;
  }
}

async function refreshGameVersions() {
  const out = {};
  for (const slug of Object.keys(PROBES)) {
    const { binary } = resolveRecipe(slug);
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

void refreshGameVersions();
