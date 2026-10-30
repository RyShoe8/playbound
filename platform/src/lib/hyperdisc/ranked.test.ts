import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  matchFindOne: vi.fn(), matchClaim: vi.fn(), matchUpdate: vi.fn(),
  ratingFindOne: vi.fn(), ratingUpdate: vi.fn(), ratingFind: vi.fn(), ratingCount: vi.fn(),
  ticketDelete: vi.fn(), ticketFind: vi.fn(), ticketClaim: vi.fn(), ticketCreate: vi.fn(), ticketUpdate: vi.fn(),
}));
const lean = (value: unknown) => ({ lean: async () => value, select: () => ({ lean: async () => value }) });
vi.mock("@/lib/db", () => ({ default: async () => {} }));
vi.mock("@/lib/models/User", () => ({ default: { findById: () => ({ select: () => ({ lean: () => Promise.resolve({ username: "Ace" }) }) }) } }));
vi.mock("@/lib/models/Mixtape", () => ({
  MixtapeMatch: { findOne: mocks.matchFindOne, findOneAndUpdate: mocks.matchClaim, updateOne: mocks.matchUpdate },
}));
vi.mock("@/lib/models/HyperdiscRanked", () => ({
  HyperdiscRating: { findOne: mocks.ratingFindOne, updateOne: mocks.ratingUpdate, find: mocks.ratingFind, countDocuments: mocks.ratingCount },
  HyperdiscQueueTicket: { deleteOne: mocks.ticketDelete, find: mocks.ticketFind, findOneAndUpdate: mocks.ticketClaim, create: mocks.ticketCreate, updateOne: mocks.ticketUpdate },
}));
import { eloChange, expectedScore, queue, rateMatch } from "./ranked";

describe("Elo", () => {
  it("is even between equal players", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(eloChange(1000, 1000)).toEqual([16, -16]);
  });
  it("rewards upsets more than expected wins", () => {
    expect(eloChange(900, 1200)[0]).toBeGreaterThan(eloChange(1200, 900)[0]);
    expect(eloChange(2000, 800)[0]).toBeGreaterThanOrEqual(1);
  });
});

describe("rateMatch", () => {
  let match: Record<string, unknown>;
  beforeEach(() => {
    vi.resetAllMocks();
    match = { matchId: "m1", host: "a", client: "b", reports: { a: { winner: "a", checksum: "1" }, b: { winner: "a", checksum: "1" } }, rated: false };
    mocks.matchFindOne.mockImplementation(() => lean(match));
    mocks.ratingFindOne.mockImplementation(() => lean({ rating: 1000 }));
    mocks.matchClaim.mockImplementation(async () => (match.rated ? null : ((match.rated = true), match)));
  });
  it("moves both ratings once both players agree", async () => {
    expect(await rateMatch("m1")).toEqual({ a: 16, b: -16 });
    const incs = mocks.ratingUpdate.mock.calls.filter(c => c[1].$inc);
    expect(incs).toHaveLength(2);
    expect(incs[0][1].$inc).toEqual({ rating: 16, wins: 1 });
    expect(incs[1][1].$inc).toEqual({ rating: -16, losses: 1 });
  });
  it("does nothing until both reports match", async () => {
    match.reports = { a: { winner: "a", checksum: "1" } };
    expect(await rateMatch("m1")).toBeNull();
    expect(mocks.ratingUpdate).not.toHaveBeenCalled();
  });
  it("rates a match only once, even when reports race", async () => {
    await Promise.all([rateMatch("m1"), rateMatch("m1")]);
    expect(mocks.ratingUpdate.mock.calls.filter(c => c[1].$inc)).toHaveLength(2);
  });
});

describe("queue", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.ratingFindOne.mockImplementation(() => lean({ rating: 1000 }));
  });
  it("joins the waiting player closest in rating", async () => {
    mocks.ticketFind.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [
      { _id: "far", rating: 1400, joinCode: "FAR1" }, { _id: "near", rating: 1020, joinCode: "NEAR" }] }) }) });
    mocks.ticketClaim.mockImplementation(async (q) => ({ _id: q._id }));
    expect(await queue("me", "v1")).toEqual({ joinCode: "NEAR" });
    expect(mocks.ticketCreate).not.toHaveBeenCalled();
  });
  it("queues the player to host when nobody is waiting", async () => {
    mocks.ticketFind.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
    expect(await queue("me", "v1")).toEqual({ host: true });
    expect(mocks.ticketCreate.mock.calls[0][0]).toMatchObject({ userId: "me", version: "v1", rating: 1000 });
  });
  it("moves on when another player claims the same room first", async () => {
    mocks.ticketFind.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [
      { _id: "taken", rating: 1000, joinCode: "GONE" }, { _id: "next", rating: 1100, joinCode: "NEXT" }] }) }) });
    mocks.ticketClaim.mockImplementation(async (q) => (q._id === "taken" ? null : { _id: q._id }));
    expect(await queue("me", "v1")).toEqual({ joinCode: "NEXT" });
  });
});
