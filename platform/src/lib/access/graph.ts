import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import CatalogMod from "@/lib/models/CatalogMod";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { accessId, type AccessGraph, type AccessNode, type GameAccess } from "./types";
import { buildAccessGraph } from "./resolver";

/**
 * Assemble the whole dependency graph from the catalog.
 *
 * One read of everything rather than a traversal that queries per hop: the
 * graph is small (hundreds of nodes), and the audit needs all of it anyway.
 * Callers that only want one answer should still build the whole graph — a
 * partial graph produces unresolved dependencies that are artefacts of the
 * query rather than real gaps, which is exactly the noise the audit exists to
 * eliminate.
 */

/** Absent access means free — the state every unclassified row is in. */
function accessFromDoc(raw: unknown): GameAccess | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  if (!a.priceType) return undefined;
  return {
    priceType: a.priceType as GameAccess["priceType"],
    regularPriceCents: (a.regularPriceCents as number) ?? null,
    currentPriceCents: (a.currentPriceCents as number) ?? null,
    qualifyingPriceCents: (a.qualifyingPriceCents as number) ?? null,
    currency: "USD",
    purchaseRequired: Boolean(a.purchaseRequired),
    requiresBaseGameAssets: Boolean(a.requiresBaseGameAssets),
    requiresOwnedBaseGame: Boolean(a.requiresOwnedBaseGame),
  };
}

function gameDependencies(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const slugs = (raw as { requiresGameSlugs?: unknown }).requiresGameSlugs;
  if (!Array.isArray(slugs)) return [];
  return slugs.filter((s): s is string => typeof s === "string" && s.length > 0).map(accessId.game);
}

export async function loadAccessGraph(): Promise<AccessGraph> {
  await dbConnect();

  const [games, editions, mods, events] = await Promise.all([
    CatalogGame.find({}).select("slug title access").lean(),
    Edition.find({}).select("gameSlug slug name").lean(),
    CatalogMod.find({}).select("slug title baseGameSlug").lean(),
    PlatformEvent.find({}).select("_id title gameSlug editionSlug").lean(),
  ]);

  const nodes: AccessNode[] = [];

  for (const g of games as Array<Record<string, unknown>>) {
    const slug = String(g.slug || "");
    if (!slug) continue;
    nodes.push({
      id: accessId.game(slug),
      kind: "game",
      label: String(g.title || slug),
      access: accessFromDoc(g.access),
      dependsOn: gameDependencies(g.access),
    });
  }

  // An edition is a way of playing its parent game, so it inherits from it.
  for (const e of editions as Array<Record<string, unknown>>) {
    const gameSlug = String(e.gameSlug || "");
    const slug = String(e.slug || "");
    if (!gameSlug || !slug) continue;
    nodes.push({
      id: accessId.edition(gameSlug, slug),
      kind: "edition",
      label: String(e.name || slug),
      dependsOn: [accessId.game(gameSlug)],
    });
  }

  // A mod is free to download and unusable without the game it patches.
  for (const m of mods as Array<Record<string, unknown>>) {
    const slug = String(m.slug || "");
    if (!slug) continue;
    const base = String(m.baseGameSlug || "");
    nodes.push({
      id: accessId.mod(slug),
      kind: "mod",
      label: String(m.title || slug),
      dependsOn: base ? [accessId.game(base)] : [],
    });
  }

  /*
   * Events depend on the specific edition when one is named, otherwise the
   * game. Naming the edition matters: an event pinned to a PlayBound Edition
   * that requires retail assets is VALUE even when the base game is free.
   */
  for (const ev of events as Array<Record<string, unknown>>) {
    const id = String(ev._id || "");
    const gameSlug = String(ev.gameSlug || "");
    if (!id) continue;
    const editionSlug = String(ev.editionSlug || "");
    const dependsOn: string[] = [];
    if (gameSlug && editionSlug) dependsOn.push(accessId.edition(gameSlug, editionSlug));
    else if (gameSlug) dependsOn.push(accessId.game(gameSlug));
    nodes.push({
      id: accessId.event(id),
      kind: "event",
      label: String(ev.title || id),
      dependsOn,
    });
  }

  return buildAccessGraph(nodes);
}
