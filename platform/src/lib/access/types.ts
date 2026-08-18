/**
 * The platform's access vocabulary.
 *
 * One rule governs everything: an experience inherits its access requirement
 * from the game experience required to use it. A mod that costs nothing but
 * needs a £5 base game is VALUE, and so is any event, edition, server or
 * collection placement that depends on it.
 *
 * Nothing outside `resolver.ts` should decide FREE vs VALUE. Features ask the
 * resolver; they do not re-derive it from a boolean, which is how a platform
 * ends up with six subtly different definitions of "free".
 */

/** What the player must spend to reach an experience. */
export type AccessTier = "FREE" | "VALUE";

/**
 * How a *game* is acquired. Only games carry this — everything else derives.
 *
 * `PAID_BASE_GAME_REQUIRED` is the case a single boolean cannot express: the
 * thing itself is free to obtain, but it is unusable without commercial files
 * or a commercial licence. A free engine that needs retail assets lives here,
 * not in FREE.
 */
export type PriceType = "FREE" | "PAID" | "PAID_BASE_GAME_REQUIRED";

export type Currency = "USD";

/** Cents, so no float arithmetic ever touches money. */
export type Cents = number;

/**
 * A place a player can buy this game.
 *
 * Affiliate availability never decides FREE vs VALUE — that is still the
 * resolver looking at qualifying price and the dependency chain. Offers only
 * answer "where, and for how much today".
 */
export interface RetailOffer {
  retailer: string;
  url: string;
  priceCents: Cents;
  affiliate: boolean;
  lastCheckedAt: string | null;
  isActive: boolean;
}

export interface GameAccess {
  priceType: PriceType;
  /** Typical undiscounted price. */
  regularPriceCents: Cents | null;
  /**
   * Lowest price among active purchase sources, when we have any.
   *
   * Derived from `offers` at read and save. Manual only when no sources are
   * listed. Cards show this, not the qualifying price.
   */
  currentPriceCents: Cents | null;
  /**
   * The price eligibility is judged against.
   *
   * Deliberately not `currentPriceCents`: sales come and go, and a game should
   * not enter and leave the catalog with a weekend promotion. This is the
   * price we have established the game is *regularly* obtainable for.
   */
  qualifyingPriceCents: Cents | null;
  currency: Currency;
  /** True when money must change hands somewhere to play this. */
  purchaseRequired: boolean;
  /** Where to buy it. Empty on free games. */
  offers?: RetailOffer[];
  /**
   * A free engine or port that cannot run without commercial data.
   *
   * Split from `requiresOwnedBaseGame` because they are different obligations:
   * assets must be present on disk, ownership is a licence question. Both make
   * the experience VALUE, but the wording shown to a player differs.
   */
  requiresBaseGameAssets?: boolean;
  requiresOwnedBaseGame?: boolean;
  /** Slugs of games this one cannot be played without. */
  requiresGameSlugs?: string[];
}

export type AccessNodeKind =
  | "game"
  | "edition"
  | "mod"
  | "event"
  | "server"
  | "collection";

/**
 * One node in the dependency graph.
 *
 * Ids are namespaced (`game:0ad`, `mod:tamriel-rebuilt`) so a mod and a game
 * may share a slug without colliding, and so an unresolved reference names the
 * kind it was looking for.
 */
export interface AccessNode {
  id: string;
  kind: AccessNodeKind;
  label?: string;
  /** Present on games; ignored elsewhere. */
  access?: GameAccess;
  /** Ids this experience cannot be used without. */
  dependsOn?: string[];
}

export type AccessGraph = Map<string, AccessNode>;

/** Namespaced id helpers, so call sites never hand-build a string. */
export const accessId = {
  game: (slug: string) => `game:${slug}`,
  edition: (gameSlug: string, editionSlug: string) => `edition:${gameSlug}:${editionSlug}`,
  mod: (slug: string) => `mod:${slug}`,
  event: (id: string) => `event:${id}`,
  server: (id: string) => `server:${id}`,
  collection: (slug: string) => `collection:${slug}`,
};

/** A dependency that costs money, and what it costs. */
export interface PaidDependency {
  id: string;
  label: string;
  priceType: PriceType;
  qualifyingPriceCents: Cents | null;
  currentPriceCents: Cents | null;
}

export interface AccessResolution {
  tier: AccessTier;
  /**
   * Every paid thing in the chain, so the UI can say *why* rather than only
   * that it is VALUE — "Requires Morrowind — usually $5.99".
   */
  paidDependencies: PaidDependency[];
  /**
   * Cheapest price a player pays today across the chain — current (offer)
   * first, qualifying as fallback. Card labels use this. Not eligibility.
   */
  fromPriceCents: Cents | null;
  /** Cheapest qualifying price across the chain. Eligibility, not the sale. */
  qualifyingPriceCents: Cents | null;
  /** Referenced ids that are not in the graph. */
  unresolved: string[];
  /** True when the walk met a cycle; the tier is then not trustworthy. */
  cycle: boolean;
}

/**
 * Ceiling a game must sit at or under to be catalog-eligible.
 *
 * A default, not a law — the plan calls for this to be settable in admin, so
 * every function that judges eligibility takes it as an argument rather than
 * reading a constant.
 */
export const DEFAULT_VALUE_PRICE_CEILING_CENTS: Cents = 1500;

export const FREE_ACCESS: GameAccess = {
  priceType: "FREE",
  regularPriceCents: 0,
  currentPriceCents: 0,
  qualifyingPriceCents: 0,
  currency: "USD",
  purchaseRequired: false,
  requiresGameSlugs: [],
};
