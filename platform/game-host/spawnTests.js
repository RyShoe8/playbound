/**
 * Persist last admin spawn-test results per game slug.
 */

import fs from "node:fs";
import path from "node:path";

const SPAWN_TEST_FILE =
  process.env.GAME_HOST_SPAWN_TESTS || "/var/lib/playbound-host/spawn-tests.json";

/** @type {Record<string, { ok: boolean, error?: string|null, at: string, durationMs?: number|null, port?: number|null }>} */
let cache = null;

function loadCache() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(SPAWN_TEST_FILE, "utf8");
    cache = JSON.parse(raw);
    if (!cache || typeof cache !== "object") cache = {};
  } catch {
    cache = {};
  }
  return cache;
}

function saveCache() {
  if (!cache) return;
  try {
    fs.mkdirSync(path.dirname(SPAWN_TEST_FILE), { recursive: true });
    fs.writeFileSync(SPAWN_TEST_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.warn("[spawn-test] save failed:", err instanceof Error ? err.message : err);
  }
}

export function getLastSpawnTests() {
  return { ...loadCache() };
}

/**
 * @param {string} slug
 * @param {{ ok: boolean, error?: string|null, durationMs?: number, port?: number|null }} result
 */
export function recordSpawnTest(slug, result) {
  const data = loadCache();
  data[slug] = {
    ok: result.ok,
    error: result.error || null,
    at: new Date().toISOString(),
    durationMs: result.durationMs ?? null,
    port: result.port ?? null,
  };
  saveCache();
  return data[slug];
}
