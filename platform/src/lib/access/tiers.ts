/**
 * Resolved access tier for every game, as a cached lookup.
 *
 * The resolver answers one node at a time from a graph, which is right for the
 * audit and wrong for a listing page — rebuilding the graph to render a grid of
 * forty cards would put four collection reads on the hot path of every request.
 * This precomputes the answer for games once and shares it, the same shape as
 * `playCountsBySlug`.
 *
 * Games only. Editions, mods and events still resolve through the full graph,
 * because their dependencies reach across collections; games depend only on
 * other games, so their tier is computable from a single read. That is the
 * whole reason this can be cheap.
 */

import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { accessId, type AccessNode, type AccessTier, type Cents } from "./types";
import { buildAccessGraph, resolveAccess } from "./resolver";
import { accessFromDoc, gameDependencies, type AccessDoc } from "./docs";

export interface GameTier {
  tier: AccessTier;
  /** Cheapest price a player pays today — card label, not eligibility. */
  fromPriceCents: Cents | null;
  /** Cheapest qualifying price across the chain. Catalog / ceiling. */
  qualifyingPriceCents: Cents | null;
  /** What has to be bought, so the UI can say why rather than only that. */
  requires: Array<{
    label: string;
    slug: string | null;
    qualifyingPriceCents: Cents | null;
    currentPriceCents: Cents | null;
  }>;
}

export type GameTierMap = Record<string, GameTier>;

/** A game with no entry in the map is free — same default as an absent record. */
export const FREE_TIER: GameTier = {
  tier: "FREE",
  fromPriceCents: null,
  qualifyingPriceCents: null,
  requires: [],
};

export function tierFor(map: GameTierMap, slug: string): GameTier {
  return map[slug] ?? FREE_TIER;
}

/**
 * Pure: rows in, tiers out.
 *
 * Split from the read so the resolution can be tested against fixtures rather
 * than against whatever happens to be in the catalog today.
 */
export function gameTiersFromRows(rows: AccessDoc[]): GameTierMap {
  const nodes: AccessNode[] = [];
  for (const row of rows) {
    const slug = String(row.slug || "");
    if (!slug) continue;
    nodes.push({
      id: accessId.game(slug),
      kind: "game",
      label: String(row.title || slug),
      access: accessFromDoc(row.access),
      dependsOn: gameDependencies(row.access),
    });
  }

  const graph = buildAccessGraph(nodes);
  const map: GameTierMap = {};

  for (const node of nodes) {
    const resolution = resolveAccess(node.id, graph);
    /*
     * Only paid games get an entry. Free ones fall through to FREE_TIER, which
     * keeps the payload small — the overwhelming majority of the catalog is
     * free, and shipping an identical object per slug to the client would be
     * most of the map for none of the information.
     */
    if (resolution.tier === "FREE") continue;
    map[node.id.slice("game:".length)] = {
      tier: "VALUE",
      fromPriceCents: resolution.fromPriceCents,
      qualifyingPriceCents: resolution.qualifyingPriceCents,
      requires: resolution.paidDependencies.map((dep) => ({
        label: dep.label,
        slug: dep.id.startsWith("game:") ? dep.id.slice("game:".length) : null,
        qualifyingPriceCents: dep.qualifyingPriceCents,
        currentPriceCents: dep.currentPriceCents,
      })),
    };
  }

  return map;
}

async function computeGameTiers(): Promise<GameTierMap> {
  try {
    await dbConnect();
    /*
     * Every game, not only the visible ones. A published game may require a
     * game that is still in draft, and reading only visible rows would make
     * that dependency unresolvable — which the resolver correctly treats as
     * VALUE, but for a reason that is an artefact of the query rather than
     * anything true about the game.
     */
    const rows = await CatalogGame.find({}).select("slug title access").lean();
    return gameTiersFromRows(rows as AccessDoc[]);
  } catch (err) {
    /*
     * A failed read must not make the catalog look paid. Falling back to an
     * empty map means everything reads FREE, which is what the catalog was
     * before any of this existed — the same direction the rest of the system
     * fails in.
     */
    console.error("[access] tier map read failed:", err);
    return {};
  }
}

export function gameAccessTiers(): Promise<GameTierMap> {
  return unstable_cache(computeGameTiers, ["catalog-access-tiers"], {
    revalidate: 300,
    // Shares the catalog tag: classifying a game in admin drops this with it.
    tags: ["catalog"],
  })();
}
