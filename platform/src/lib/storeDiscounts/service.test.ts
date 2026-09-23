import { describe, expect, it } from "vitest";
import { buildStoreUrl } from "./service";
import type { StoreAffiliateStamp } from "@/lib/access/storeUrls";

/**
 * The affiliate-safety logic for /deals discount links, tested directly.
 *
 * This is the highest-stakes function in the whole store-discounts feature:
 * PlayBound has a live GamersGate affiliate program, and the whole reason
 * `directUrlAvailable` exists on `DiscoveredDiscount.metadata` is to stop this
 * function from stamping our own affiliate credential onto a URL that isn't
 * actually on that store's domain (CheapShark's redirect, in the one case that
 * still needs it — see providers/cheapshark.ts's Epic fallback).
 */

const GOG_STAMP: StoreAffiliateStamp = {
  id: "2103608854",
  template: "https://track.adtraction.com/t/t?a=1578845460&as=2103608854&t=2&tk=1&url={url}",
};
const GAMERSGATE_STAMP: StoreAffiliateStamp = {
  id: "94951b1645cc475203b87d08a500346557c8a2b3",
  param: "aff",
};

describe("buildStoreUrl", () => {
  it("wraps a direct GOG URL in the configured affiliate template", () => {
    const url = buildStoreUrl(
      "https://www.gog.com/en/game/some-game",
      "gog",
      true,
      { GOG: GOG_STAMP }
    );
    expect(url).toContain("track.adtraction.com");
    expect(url).toContain(encodeURIComponent("https://www.gog.com/en/game/some-game"));
  });

  it("stamps a direct GamersGate URL with the live aff param", () => {
    const url = buildStoreUrl(
      "https://www.gamersgate.com/product/some-game/",
      "gamersgate",
      true,
      { GamersGate: GAMERSGATE_STAMP }
    );
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.gamersgate.com");
    expect(parsed.searchParams.get("aff")).toBe("94951b1645cc475203b87d08a500346557c8a2b3");
  });

  it("never stamps a URL flagged directUrlAvailable: false, even for a store with a real stamp", () => {
    // The actual regression this guards: a GamersGate stamp genuinely exists
    // in the map (store === "gamersgate" here, matching it), but the URL is
    // CheapShark's redirect, not gamersgate.com — stamping it would put our
    // real credential on cheapshark.com, where it does nothing for us and
    // silently loses the commission. This is the exact case that follows from
    // "GamersGate is a live affiliate program" — if this test doesn't fail
    // when the guard is removed, the guard isn't being exercised.
    const url = buildStoreUrl(
      "https://www.cheapshark.com/redirect?dealID=abc",
      "gamersgate",
      false,
      { GamersGate: GAMERSGATE_STAMP }
    );
    expect(url).not.toContain("aff=");
    expect(new URL(url).hostname).toBe("www.cheapshark.com");
  });

  it("leaves a direct URL unstamped when no affiliate is configured for that store", () => {
    // Steam has no affiliate program today. This must not throw or invent one.
    const url = buildStoreUrl("https://store.steampowered.com/app/12345/", "steam", true, {});
    expect(new URL(url).hostname).toBe("store.steampowered.com");
    expect(url).not.toContain("cheapshark");
  });

  it("still applies our own outbound-click UTM even when no affiliate exists", () => {
    const url = buildStoreUrl("https://store.steampowered.com/app/12345/", "steam", true, {});
    expect(new URL(url).searchParams.get("utm_campaign")).toBe("deals_discount");
  });

  it("applies UTM but never an affiliate stamp on a non-direct URL", () => {
    const url = buildStoreUrl("https://www.cheapshark.com/redirect?dealID=abc", "epic", false, {});
    expect(new URL(url).searchParams.get("utm_campaign")).toBe("deals_discount");
  });
});
