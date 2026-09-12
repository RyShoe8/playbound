/**
 * Which OpenRA mod a party is playing.
 *
 * OpenRA's `ra`, `cnc`, `d2k` and `ts` are separate games sharing an engine,
 * and a client may only join a server running the same one. The dedicated
 * server is started with `Game.Mod=`, but the client was launched with only
 * `Launch.Connect` — so it joined with whatever mod it happened to have open
 * last, and the server rejected it with "the server is running an incompatible
 * mod". Same engine version on both sides; different game.
 *
 * ─── Kept in step with the host agent ───────────────────────────────────────
 * `game-host/recipes.js` has its own copy of this rule, because it runs on the
 * VPS and cannot import from here. The two must agree: if the server resolves
 * an edition to `cnc` and the client to `ra`, the join fails in exactly the way
 * this exists to prevent. Change one, change the other.
 */

export type OpenRaMod = "ra" | "cnc" | "d2k" | "ts" | "ca" | "hv" | "ra2" | "e2140";

/**
 * Red Alert is the default because it is OpenRA's flagship mod and the one an
 * unlabelled edition is overwhelmingly likely to mean.
 */
export function openRaModFor(editionSlug: string | null | undefined): OpenRaMod {
  const raw = String(editionSlug || "").toLowerCase();
  /*
   * OpenE2140 before any `dune` / generic OpenRA branches — its portable only
   * ships mod `e2140`. Mapping it to `ra` (the old fallthrough) made party
   * members launch OpenE2140.exe with Game.Mod=ra and exit immediately.
   */
  if (raw.includes("e2140") || raw.includes("opene2140") || raw.includes("earth-2140")) {
    return "e2140";
  }
  /*
   * Character-for-character the agent's rule, including its quirk: a bare
   * `tiberian` match claims Tiberian Sun for `cnc` as well as Tiberian Dawn.
   * That is arguably wrong, but the agent is what starts the server and cannot
   * be redeployed from here — so being "more correct" here would resolve `ts`
   * against a server running `cnc` and reintroduce the exact mismatch this
   * module exists to remove. Fix it there first, then here.
   */
  if (raw.includes("cnc") || raw.includes("tiberian") || raw === "td") return "cnc";
  if (raw.includes("d2k") || raw.includes("dune")) return "d2k";
  if (raw.includes("combined") || raw.includes("ca")) return "ca";
  if (raw.includes("openhv") || raw === "hv") return "hv";
  if (raw.includes("ra2")) return "ra2";
  return "ra";
}

/**
 * Official OpenRA portable covers ra/cnc/d2k via party.openRaMod.
 * Other editions imply a fixed Game.Mod — stock mod picker must hide.
 */
export function openRaEditionAllowsStockModPicker(
  editionSlug: string | null | undefined
): boolean {
  const raw = String(editionSlug || "").toLowerCase().trim();
  return !raw || raw === "official";
}

/** True for games where the client has to be told which mod to join with. */
export function needsModArgument(gameSlug: string): boolean {
  return gameSlug === "openra" || gameSlug === "earth-2140-trilogy" || gameSlug === "openhv";
}
