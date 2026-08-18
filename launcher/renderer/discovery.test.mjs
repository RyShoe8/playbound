/**
 * Run: node renderer/discovery.test.mjs
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accessPriceLabel,
  accessTierOf,
  filterByDiscovery,
  filterGamesByPrice,
  formatCents,
  parseDiscoveryMode,
  parsePriceFilter,
  priceVisibleIn,
  requiresGamePriceLine,
  scopeCatalogLiveStats,
  tierVisibleIn,
} from "./discovery.js";

test("unrecognised discovery mode falls back to ALL", () => {
  assert.equal(parseDiscoveryMode(undefined), "ALL");
  assert.equal(parseDiscoveryMode("nope"), "ALL");
  assert.equal(parseDiscoveryMode("FREE"), "FREE");
});

test("missing accessTier is FREE so a stale catalog stays visible", () => {
  assert.equal(accessTierOf({ slug: "openra" }), "FREE");
  assert.equal(accessTierOf({ slug: "gold", accessTier: "VALUE" }), "VALUE");
});

test("FREE mode hides VALUE and keeps FREE", () => {
  const list = [
    { slug: "openra", accessTier: "FREE" },
    { slug: "gold", accessTier: "VALUE" },
    { slug: "legacy" },
  ];
  assert.deepEqual(
    filterByDiscovery(list, "FREE").map((g) => g.slug),
    ["openra", "legacy"]
  );
  assert.equal(filterByDiscovery(list, "ALL").length, 3);
});

test("unknown slug on a related item stays visible", () => {
  const events = [{ title: "Lan", gameSlug: "openra" }, { title: "Meetup" }];
  const tiers = new Map([["gold", "VALUE"]]);
  const visible = filterByDiscovery(events, "FREE", (e) => e.gameSlug, tiers);
  assert.equal(visible.length, 2);
});

test("related VALUE slug is hidden in FREE mode", () => {
  const mods = [{ slug: "fx", baseGameSlug: "gold" }, { slug: "ra", baseGameSlug: "openra" }];
  const tiers = new Map([
    ["gold", "VALUE"],
    ["openra", "FREE"],
  ]);
  const visible = filterByDiscovery(mods, "FREE", (m) => m.baseGameSlug, tiers);
  assert.deepEqual(
    visible.map((m) => m.slug),
    ["ra"]
  );
});

test("price chips keep free games and the under-X ceiling", () => {
  assert.equal(priceVisibleIn(null, "under5"), true);
  assert.equal(priceVisibleIn(500, "under5"), true);
  assert.equal(priceVisibleIn(501, "under5"), false);
  assert.equal(parsePriceFilter("under10"), "under10");
  const games = [
    { slug: "a", fromPriceCents: null },
    { slug: "b", fromPriceCents: 599 },
    { slug: "c", fromPriceCents: 1499 },
  ];
  assert.deepEqual(
    filterGamesByPrice(games, "under10").map((g) => g.slug),
    ["a", "b"]
  );
});

test("card and commerce labels", () => {
  assert.equal(accessPriceLabel(null), "FREE");
  assert.equal(accessPriceLabel(599), "$5.99");
  assert.equal(formatCents(599), "$5.99");
  assert.equal(requiresGamePriceLine("Gold", 599), "Requires Gold — $5.99");
  assert.equal(requiresGamePriceLine("Gold", null), null);
  assert.equal(tierVisibleIn("VALUE", "FREE"), false);
  assert.equal(tierVisibleIn("VALUE", "ALL"), true);
});

test("catalog stats drop VALUE games in FREE mode", () => {
  const live = {
    gameCount: 3,
    modCount: 10,
    editionCount: 5,
    playingNow: 40,
    byGame: [
      { slug: "gold", title: "Gold", playingNow: 20 },
      { slug: "openra", title: "OpenRA", playingNow: 15 },
      { slug: "legacy", title: "Legacy", playingNow: 5 },
    ],
    mostPopular: [
      { slug: "gold", title: "Gold", playingNow: 20 },
      { slug: "openra", title: "OpenRA", playingNow: 15 },
    ],
    editionCountBySlug: { gold: 2, openra: 1, legacy: 2 },
    modCountBySlug: { gold: 8, openra: 2 },
  };
  const tiers = new Map([
    ["gold", "VALUE"],
    ["openra", "FREE"],
  ]);
  const next = scopeCatalogLiveStats(live, "FREE", tiers);
  assert.equal(next.gameCount, 2);
  assert.equal(next.playingNow, 20);
  assert.equal(next.editionCount, 3);
  assert.equal(next.modCount, 2);
  assert.deepEqual(
    next.mostPopular.map((g) => g.slug),
    ["openra", "legacy"]
  );
  assert.equal(scopeCatalogLiveStats(live, "ALL", tiers), live);
});
