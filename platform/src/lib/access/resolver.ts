import {
  DEFAULT_VALUE_PRICE_CEILING_CENTS,
  type AccessGraph,
  type AccessNode,
  type AccessResolution,
  type Cents,
  type GameAccess,
  type PaidDependency,
} from "./types";

/**
 * The one place FREE vs VALUE is decided.
 *
 * Everything else — games, editions, mods, events, servers, collections,
 * discovery, search, Connect — asks this. Nothing re-derives it. That is the
 * whole point: a platform that answers "is this free?" in six places will
 * eventually answer it six different ways, and the one that disagrees will be
 * the one a player sees after they have already joined a party.
 */

/** Does this game, on its own, require money? */
export function gameRequiresPurchase(access: GameAccess | undefined): boolean {
  if (!access) return false;
  if (access.priceType === "FREE") {
    // A FREE priceType that also demands retail assets is a contradiction we
    // would rather surface than honour. Audit reports it; here we take the
    // safer reading and treat it as requiring purchase.
    return Boolean(access.requiresBaseGameAssets || access.requiresOwnedBaseGame);
  }
  return true;
}

function toPaidDependency(node: AccessNode): PaidDependency {
  const access = node.access;
  return {
    id: node.id,
    label: node.label || node.id,
    priceType: access?.priceType ?? "PAID",
    qualifyingPriceCents: access?.qualifyingPriceCents ?? null,
    currentPriceCents: access?.currentPriceCents ?? null,
  };
}

/**
 * Walk an experience's dependency chain and decide its tier.
 *
 * Any paid dependency anywhere in the chain makes the whole thing VALUE. That
 * is deliberately blunt for v1 — a "some of this is free" tier is a real thing
 * we may want later, but predicting it wrongly is worse than not having it.
 *
 * A cycle or a missing dependency does not throw. Discovery has to render
 * something, so the walk records the problem, reports VALUE (the cautious
 * answer — never advertise as free what we could not verify), and lets the
 * audit screen be the place that complains.
 */
export function resolveAccess(
  rootId: string,
  graph: AccessGraph
): AccessResolution {
  const paid = new Map<string, PaidDependency>();
  const unresolved: string[] = [];
  const visited = new Set<string>();
  /** Ids on the current path — a revisit here is a cycle, not a diamond. */
  const onPath = new Set<string>();
  let cycle = false;

  const walk = (id: string) => {
    if (onPath.has(id)) {
      cycle = true;
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    onPath.add(id);

    const node = graph.get(id);
    if (!node) {
      unresolved.push(id);
      onPath.delete(id);
      return;
    }

    if (gameRequiresPurchase(node.access)) {
      paid.set(node.id, toPaidDependency(node));
    }
    for (const child of node.dependsOn ?? []) walk(child);

    onPath.delete(id);
  };

  walk(rootId);

  const paidDependencies = [...paid.values()];
  const prices = paidDependencies
    .map((d) => d.qualifyingPriceCents ?? d.currentPriceCents)
    .filter((p): p is Cents => typeof p === "number" && p > 0);

  // Unverifiable chains resolve to VALUE. Being wrong in that direction shows
  // a price that was not needed; the other direction promises free and bills.
  const tier =
    paidDependencies.length > 0 || cycle || unresolved.length > 0 ? "VALUE" : "FREE";

  return {
    tier,
    paidDependencies,
    fromPriceCents: prices.length ? Math.min(...prices) : null,
    unresolved,
    cycle,
  };
}

/** Convenience for the common "is this visible in FREE mode?" question. */
export function isFreeToAccess(rootId: string, graph: AccessGraph): boolean {
  return resolveAccess(rootId, graph).tier === "FREE";
}

/**
 * Filter any list of entities by the viewer's discovery mode.
 *
 * The single call every surface uses — homepage, search, collections, servers,
 * events — so "FREE means FREE everywhere" is one function rather than a
 * convention each page has to remember.
 */
export function filterByDiscoveryMode<T>(
  items: T[],
  mode: "FREE" | "ALL",
  graph: AccessGraph,
  idOf: (item: T) => string
): T[] {
  if (mode === "ALL") return items;
  return items.filter((item) => isFreeToAccess(idOf(item), graph));
}

export type AccessIssueCode =
  | "UNRESOLVED_DEPENDENCY"
  | "CIRCULAR_DEPENDENCY"
  | "PAID_WITHOUT_PRICE"
  | "PRICE_ABOVE_CEILING"
  | "FREE_WITH_PAID_DEPENDENCY"
  | "BASE_GAME_REQUIRED_UNSPECIFIED";

export interface AccessIssue {
  code: AccessIssueCode;
  nodeId: string;
  label: string;
  detail: string;
}

/**
 * Everything wrong with the graph, for the admin audit screen.
 *
 * The gate before FREE mode goes live is this returning nothing: a FREE mode
 * built on an unaudited graph will eventually show a player something that
 * asks for money, and that single occurrence costs more trust than the feature
 * earns.
 */
export function auditAccessGraph(
  graph: AccessGraph,
  opts: { ceilingCents?: Cents } = {}
): AccessIssue[] {
  const ceiling = opts.ceilingCents ?? DEFAULT_VALUE_PRICE_CEILING_CENTS;
  const issues: AccessIssue[] = [];

  for (const node of graph.values()) {
    const label = node.label || node.id;
    const access = node.access;

    for (const dep of node.dependsOn ?? []) {
      if (!graph.has(dep)) {
        issues.push({
          code: "UNRESOLVED_DEPENDENCY",
          nodeId: node.id,
          label,
          detail: `Depends on ${dep}, which is not in the catalog.`,
        });
      }
    }

    if (access) {
      const paid = access.priceType !== "FREE";
      const price = access.qualifyingPriceCents ?? access.currentPriceCents;

      if (access.priceType === "PAID" && (price === null || price === undefined)) {
        issues.push({
          code: "PAID_WITHOUT_PRICE",
          nodeId: node.id,
          label,
          detail: "Marked paid but carries no price, so eligibility cannot be judged.",
        });
      }

      if (paid && typeof price === "number" && price > ceiling) {
        issues.push({
          code: "PRICE_ABOVE_CEILING",
          nodeId: node.id,
          label,
          detail: `Qualifying price ${formatCents(price)} is above the ${formatCents(ceiling)} ceiling.`,
        });
      }

      if (
        access.priceType === "PAID_BASE_GAME_REQUIRED" &&
        (node.dependsOn ?? []).length === 0
      ) {
        issues.push({
          code: "BASE_GAME_REQUIRED_UNSPECIFIED",
          nodeId: node.id,
          label,
          detail: "Requires a paid base game, but no dependency names which one.",
        });
      }
    }

    // A node claiming to be free while depending on something paid.
    if (access?.priceType === "FREE" && !gameRequiresPurchase(access)) {
      const resolution = resolveAccess(node.id, graph);
      if (resolution.paidDependencies.some((d) => d.id !== node.id)) {
        issues.push({
          code: "FREE_WITH_PAID_DEPENDENCY",
          nodeId: node.id,
          label,
          detail: `Marked free but depends on ${resolution.paidDependencies
            .filter((d) => d.id !== node.id)
            .map((d) => d.label)
            .join(", ")}.`,
        });
      }
    }

    if (resolveAccess(node.id, graph).cycle) {
      issues.push({
        code: "CIRCULAR_DEPENDENCY",
        nodeId: node.id,
        label,
        detail: "Dependency chain loops back on itself.",
      });
    }
  }

  return issues;
}

/** Whether a game may be listed at all, given the configured ceiling. */
export function meetsPriceCeiling(
  access: GameAccess | undefined,
  ceilingCents: Cents = DEFAULT_VALUE_PRICE_CEILING_CENTS
): boolean {
  if (!access || access.priceType === "FREE") return true;
  const price = access.qualifyingPriceCents ?? access.currentPriceCents;
  if (typeof price !== "number") return false;
  return price <= ceilingCents;
}

export function formatCents(cents: Cents | null | undefined): string {
  if (typeof cents !== "number") return "—";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

/** Builds a graph from loose nodes, for callers assembling one per request. */
export function buildAccessGraph(nodes: AccessNode[]): AccessGraph {
  return new Map(nodes.map((n) => [n.id, n]));
}
