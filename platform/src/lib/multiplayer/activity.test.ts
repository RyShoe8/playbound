import { expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
const party = vi.hoisted(() => ({ aggregate: vi.fn(async () => [{ _id: "openra", count: 2 }]) }));
vi.mock("@/lib/models/Party", () => ({ default: party }));
vi.mock("@/lib/playTogether/party/serialize", () => ({ OPEN_PARTY_STATUSES: ["forming", "ready", "playing"] }));
const games = [{ slug: "openra", title: "OpenRA", features: ["Online Multiplayer"], tags: [], genres: ["Strategy"], launchMethods: ["server"] }];
vi.mock("@/lib/catalog", () => ({ listGames: async () => games }));
vi.mock("@/lib/access/discover", () => ({ listDiscoverableGames: async () => games }));
vi.mock("@/lib/access/resolver", () => ({ gameRequiresPurchase: () => false }));
vi.mock("@/lib/playTogether/lookingToParty", () => ({ getLookingToPartyCounts: async () => ({ total: 3, byGame: { openra: 3 } }) }));
vi.mock("@/lib/liveActivity", () => ({ countActivePlatformPlayersByGame: async () => { throw new Error("Presence temporarily unavailable"); } }));
vi.mock("@/lib/servers/registry", () => ({ getPlayerCountForGame: async () => ({ players: 17, servers: 4 }) }));
it("keeps server totals when presence fails and aggregates parties and LFG independently", async () => {
  vi.stubEnv("MONGODB_URI", "test-only");
  try {
    const { getMultiplayerActivitySnapshot } = await import("./activity");
    const snapshot = await getMultiplayerActivitySnapshot();
    expect(snapshot.summary).toEqual({ totalServerPlayers: 17, totalServersOnline: 4, totalOpenParties: 2, totalUsersLooking: 3 });
    expect(party.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      { $match: expect.objectContaining({ status: { $in: ["forming", "ready", "playing"] }, $expr: expect.any(Object) }) },
    ]));
  } finally { vi.unstubAllEnvs(); }
});
