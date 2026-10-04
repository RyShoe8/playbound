import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ trackFind: vi.fn(), settingsFind: vi.fn(), profileFind: vi.fn(), profileUpdate: vi.fn(), matchFind: vi.fn(), matchUpdate: vi.fn(), matchClaim: vi.fn(), trackExists: vi.fn(), sessionFind: vi.fn() }));
const chain = (value: unknown) => ({ lean: async () => value, select: () => ({ lean: async () => value }) });
vi.mock("@/lib/db", () => ({ default: async () => {} }));
vi.mock("@/lib/models/MultiplayerSession", () => ({ default: { findOne: mocks.sessionFind } }));
vi.mock("@/lib/models/Mixtape", () => ({
  MixtapeTrack: { find: () => ({ sort: () => ({ lean: mocks.trackFind }) }), exists: mocks.trackExists },
  MixtapeSettings: { findOne: mocks.settingsFind },
  MixtapeProfile: { findOne: mocks.profileFind, updateOne: mocks.profileUpdate },
  MixtapeMatch: { findOne: mocks.matchFind, updateOne: mocks.matchUpdate, findOneAndUpdate: mocks.matchClaim },
}));
import { dub, reportMatch, registerMatch } from "./service";
let row: { matchId: string; host: string; client: string; decks: Record<string, string[]>; reports: Record<string, { winner: string; checksum: string }>; dubTrack: string };
beforeEach(() => {
  vi.resetAllMocks();
  row = { matchId: "match12345", host: "a", client: "b", decks: { a: ["own"], b: ["new", "second"] }, reports: { a: { winner: "a", checksum: "123" }, b: { winner: "a", checksum: "123" } }, dubTrack: "" };
  mocks.matchFind.mockImplementation(() => chain(row));
  mocks.profileFind.mockImplementation(() => chain({ inventory: ["own"] }));
  mocks.trackExists.mockResolvedValue(true);
  mocks.matchClaim.mockImplementation(async (_q, u) => {
    if (row.dubTrack && row.dubTrack !== u.$set.dubTrack) return null;
    row.dubTrack = u.$set.dubTrack; return row;
  });
});
describe("Mixtape awards", () => {
  it("rejects a loser and never changes their inventory", async () => {
    await expect(dub("b", { matchId: row.matchId, trackId: "own" })).rejects.toThrow();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });
  it("requires agreement from both authenticated match participants", async () => {
    delete row.reports.b;
    await expect(dub("a", { matchId: row.matchId, trackId: "new" })).rejects.toThrow();
  });
  it("rejects a tape outside the opponent's immutable match deck", async () => {
    await expect(dub("a", { matchId: row.matchId, trackId: "not-in-match" })).rejects.toThrow();
  });
  it("atomically claims one tape even when requests race", async () => {
    const results = await Promise.allSettled([dub("a", { matchId: row.matchId, trackId: "new" }), dub("a", { matchId: row.matchId, trackId: "second" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(mocks.profileUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.profileUpdate.mock.calls[0][0].userId).toBe("a");
  });
  it("rejects spoofed room membership before creating a match", async () => {
    mocks.sessionFind.mockReturnValue(chain(null));
    await expect(registerMatch("a", { matchId: row.matchId, sessionId: "room", role: "host", sessionToken: "wrong" })).rejects.toThrow();
    expect(mocks.matchUpdate).not.toHaveBeenCalled();
  });
  it("does not allow result overwrites", async () => {
    await reportMatch("a", { matchId: row.matchId, winner: "b", checksum: "999" });
    expect(mocks.matchUpdate.mock.calls[0][0]["reports.a"]).toEqual({ $exists: false });
  });
});
