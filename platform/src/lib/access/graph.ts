import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import CatalogMod from "@/lib/models/CatalogMod";
import PlatformEvent from "@/lib/models/PlatformEvent";
import { accessId, type AccessGraph, type AccessNode } from "./types";
import { buildAccessGraph } from "./resolver";
import { accessFromDoc, gameDependencies } from "./docs";
import { canonicalCatalogGameSlug } from "@/lib/catalogGameAliases";

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

/**
 * What an edition cannot be used without.
 *
 * Exported so the rule is testable without a database — the interesting part is
 * a single boolean, and `loadAccessGraph` needs Mongo to reach it.
 *
 * Anything other than an explicit `true` keeps the parent edge. A missing or
 * malformed flag must mean "inherits", not "free": defaulting the other way
 * would make every legacy edition row that predates the field resolve FREE.
 */
function editionDependencies(gameSlug: string, isStandalone: unknown): string[] {
  return isStandalone === true ? [] : [accessId.game(gameSlug)];
}

export async function loadAccessGraph(): Promise<AccessGraph> {
  await dbConnect();

  const [games, editions, mods, events] = await Promise.all([
    CatalogGame.find({}).select("slug title access").lean(),
    Edition.find({}).select("gameSlug slug name isStandalone").lean(),
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

  /*
   * An edition is a way of playing its parent game, so it inherits from it —
   * unless it is standalone.
   *
   * `isStandalone` is the catalog's existing answer to "does this edition need
   * the base game's files or licence?" (see `masterCopy.ts`, which reads the
   * same flag). When it is true, the edition ships everything it needs, so the
   * parent's price is not a cost the player has to pay to use it, and keeping
   * the edge made a free edition of a paid game resolve to VALUE.
   *
   * HorizonXI is the case that forced this: its launcher downloads a complete
   * Final Fantasy XI client, so playing it costs nothing, while the parent game
   * is correctly PAID because Square Enix's retail service still is. Before
   * this, the only ways to model that were to lie about the parent or to hide a
   * genuinely free edition from Free mode.
   *
   * A non-standalone edition keeps the edge, so the default stays the safe
   * direction described in `types.ts`.
   */
  for (const e of editions as Array<Record<string, unknown>>) {
    const gameSlug = canonicalCatalogGameSlug(String(e.gameSlug || ""));
    const slug = String(e.slug || "");
    if (!gameSlug || !slug) continue;
    nodes.push({
      id: accessId.edition(gameSlug, slug),
      kind: "edition",
      label: String(e.name || slug),
      dependsOn: editionDependencies(gameSlug, e.isStandalone),
    });
  }

  // A mod is free to download and unusable without the game it patches.
  for (const m of mods as Array<Record<string, unknown>>) {
    const slug = String(m.slug || "");
    if (!slug) continue;
    const base = canonicalCatalogGameSlug(String(m.baseGameSlug || ""));
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
