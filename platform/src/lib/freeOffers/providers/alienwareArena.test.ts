import { afterEach, describe, expect, it, vi } from "vitest";
import { AlienwareArenaProviderAdapter, remainingAlienwareKeys } from "./alienwareArena";

afterEach(() => vi.unstubAllGlobals());

describe("Alienware key availability", () => {
  it("uses the largest country/tier pool rather than adding replicated pools", () => {
    expect(remainingAlienwareKeys('var countryKeys = {"US":{"1":12,"2":7},"CA":{"1":9},"GB":{"3":2}};')).toEqual({ US: 12, CA: 9, GB: 2 });
    expect(remainingAlienwareKeys('var countryKeys = {"US":[],"CA":{"2":3},"GB":[]};')).toEqual({ US: 0, CA: 3, GB: 0 });
    expect(remainingAlienwareKeys('var countryKeys = {"US":[],"CA":[],"GB":[]};')).toEqual({ US: 0, CA: 0, GB: 0 });
    expect(() => remainingAlienwareKeys("<html>No inventory</html>")).toThrow();
  });

  it("removes exhausted giveaways while retaining a positive count", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("featured-tile-data")) return new Response(JSON.stringify({
        id: 1, title: "Sold Out Steam Key Giveaway", url: "/sold-out",
        data: [{ id: 2, title: "Available Steam Key Giveaway", url: "/available" }],
      }));
      return new Response(url.endsWith("/available")
        ? 'var countryKeys = {"US":{"1":5},"CA":{"1":5},"GB":[]};'
        : 'var countryKeys = {"US":[],"CA":[],"GB":[]};');
    }));

    const offers = await new AlienwareArenaProviderAdapter().fetchCurrentOffers();
    expect(offers).toHaveLength(1);
    expect(offers[0].title).toBe("Available Steam");
    expect(offers[0].metadata.remainingKeysByRegion).toEqual({ US: 5, CA: 5, GB: 0 });
  });

  it("fails the scan if inventory cannot be verified, preserving old offers", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("featured-tile-data")
        ? new Response(JSON.stringify({ id: 1, title: "Game Key Giveaway", url: "/game" }))
        : new Response("Unavailable", { status: 503 })
    ));
    await expect(new AlienwareArenaProviderAdapter().fetchCurrentOffers()).rejects.toThrow("503");
  });

  it("returns an authoritative empty batch when every listed pool is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("featured-tile-data")
        ? new Response(JSON.stringify({ id: 1, title: "Gone Key Giveaway", url: "/gone" }))
        : new Response('var countryKeys = {"US":[],"CA":[],"GB":[]};')
    ));
    const adapter = new AlienwareArenaProviderAdapter();
    expect(adapter.canExpireEmptyBatch).toBe(true);
    expect(await adapter.fetchCurrentOffers()).toEqual([]);
  });
});
