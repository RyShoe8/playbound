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
  // luanti recipe resolves luantiserver or minetestserver on Ubuntu 24.04.
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
  veloren: { args: ["--version"], pick: pickFirstVersion },
  flightgear: { args: ["--version"], pick: pickFirstVersion },
  "space-station-14": { args: ["--version"], pick: pickFirstVersion },
  "team-fortress-2": { args: ["-version"], pick: pickFirstVersion },
  "counter-strike-2": { args: ["-version"], pick: pickFirstVersion },
  openhv: { args: ["--version"], pick: pickFirstVersion },
  "re-volt-rvgl": { args: ["-version"], pick: pickFirstVersion },
  "chris-sawyers-locomotion": { args: ["--version"], pick: pickFirstVersion },
  "renegade-x": { args: ["-version"], pick: pickFirstVersion },
  gemrb: { args: ["--version"], pick: pickFirstVersion },
  "wipeout-rewrite": { args: ["--version"], pick: pickFirstVersion },
  exult: { args: ["--version"], pick: pickFirstVersion },
  "hurry-curry": { args: ["--version"], pick: pickFirstVersion },
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
