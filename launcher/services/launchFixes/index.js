"use strict";

/**
 * Per-game launch fixes.
 *
 * Every fix used to live inline in main.js's playGameInner — one 1,400-line
 * function holding two dozen `if (slug === …)` blocks — so fixes for
 * unrelated games collided in review and in parallel edits. Each game's
 * pre-launch fix now lives in its own module here and is registered below.
 *
 * A fix module exports `{ slugs, prepare(ctx) }`. `prepare` runs right
 * before the game process starts, may touch the game's own files, and may
 * return `{ env }` to merge into the launch environment. It must never throw
 * a launch: failures are logged and the game starts anyway.
 *
 * @typedef {object} LaunchFixContext
 * @property {string} slug
 * @property {{ exe?: string, dir?: string }} info   Resolved install for this launch.
 * @property {NodeJS.Platform} platform
 * @property {() => object} loadSettings
 * @property {(next: object) => void} saveSettings
 * @property {string[]} resourceRoots  Where bundled resources live (packaged first).
 */

const FIXES = [require("./streetsOfRageRemake"), require("./xmenArcadeRemake"), require("./tmntRescuePalooza")];

const bySlug = new Map();
for (const fix of FIXES) {
  for (const slug of fix.slugs) {
    if (bySlug.has(slug)) throw new Error(`Two launch fixes claim ${slug}`);
    bySlug.set(slug, fix);
  }
}

/** Run the slug's fix, if any. Returns env vars to merge, or null. */
async function prepareLaunch(slug, ctx) {
  const fix = bySlug.get(slug);
  if (!fix) return null;
  try {
    const result = await fix.prepare({ ...ctx, slug });
    return result?.env && Object.keys(result.env).length ? result.env : null;
  } catch (err) {
    console.warn(`[launch-fix] ${slug} skipped:`, err?.message || err);
    return null;
  }
}

module.exports = { prepareLaunch, hasLaunchFix: (slug) => bySlug.has(slug) };
