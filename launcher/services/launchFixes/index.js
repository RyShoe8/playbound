"use strict";

/**
 * Per-game launch fixes.
 *
 * Every fix used to live inline in main.js's playGameInner — one 1,400-line
 * function holding two dozen `if (slug === …)` blocks — so fixes for
 * unrelated games collided in review and in parallel edits. Each game's
 * pre-launch fix now lives in its own module here and is registered below.
 *
 * Two phases, both optional per fix:
 * - `resolve(state, helpers)` picks the binary and arguments. It runs where
 *   the launch path is first known and returns the (possibly changed)
 *   `{ launchPath, args, info }`.
 * - `prepare(ctx)` runs right before the process starts, may touch the
 *   game's own files, and may return `{ env }` to merge into the launch
 *   environment.
 * `prepare` errors are logged and the launch continues — those blocks were
 * always best-effort. `resolve` errors propagate, exactly as the inline
 * code they replaced did: a launch path that cannot be resolved should stop
 * the launch, not start the wrong binary.
 *
 * Still inline in playGameInner, on purpose: Dune Legacy (PAK download),
 * MrBoom (shared RetroArch runtime), Morrowind TES3MP (local dedicated
 * server), Volleyball Legends (Roblox handoff that skips the spawn) and
 * GoldenEye: Source (Steam handoff). Each is wired into launcher services
 * that a registry module would have to be handed wholesale.
 *
 * @typedef {object} LaunchFixContext
 * @property {string} slug
 * @property {{ exe?: string, dir?: string }} info   Resolved install for this launch.
 * @property {NodeJS.Platform} platform
 * @property {() => object} loadSettings
 * @property {(next: object) => void} saveSettings
 * @property {string[]} resourceRoots  Where bundled resources live (packaged first).
 * @property {{ width: number, height: number }} [workArea]  Primary display work area.
 */

const FIXES = [
  require("./streetsOfRageRemake"),
  require("./xmenArcadeRemake"),
  require("./tmntRescuePalooza"),
  ...require("./displayPrep"),
];
const RESOLVERS = [...require("./exeResolution")];

const bySlug = new Map();
for (const fix of FIXES) {
  for (const slug of fix.slugs) {
    if (bySlug.has(slug)) throw new Error(`Two launch fixes claim ${slug}`);
    bySlug.set(slug, fix);
  }
}

const resolverBySlug = new Map();
for (const fix of RESOLVERS) {
  for (const slug of fix.slugs) {
    if (resolverBySlug.has(slug)) throw new Error(`Two launch resolvers claim ${slug}`);
    resolverBySlug.set(slug, fix);
  }
}

/**
 * Run the slug's launch-path resolver, if any. Returns the state with
 * launchPath, args and info (unchanged when there is no resolver). Errors
 * propagate to the launch, as they did inline.
 */
function resolveLaunch(slug, state, helpers) {
  const fix = resolverBySlug.get(slug);
  if (!fix) return state;
  return fix.resolve({ ...state, slug }, { platform: process.platform, ...helpers }) || state;
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

module.exports = {
  prepareLaunch,
  resolveLaunch,
  hasLaunchFix: (slug) => bySlug.has(slug),
  hasLaunchResolver: (slug) => resolverBySlug.has(slug),
};
