import { beforeEach, describe, expect, it, vi } from "vitest";

let found: Record<string, unknown> | null = null;
vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/lib/models/Party", () => ({ default: { findById: vi.fn(async () => found) } }));
vi.mock("./serialize", () => ({ partyPayloadForDoc: vi.fn(async (d: unknown) => d) }));

import { loadPartyAsLeader, partyReply } from "./guards";

describe("loadPartyAsLeader", () => {
  beforeEach(() => {
    found = null;
  });

  it("404s a missing party", async () => {
    expect(await loadPartyAsLeader("p", "u", "Only the leader")).toEqual({ error: "Party not found", status: 404 });
  });

  it("checks the leader before the ended state, with the caller's message", async () => {
    found = { leaderId: "someone-else", status: "ended" };
    expect(await loadPartyAsLeader("p", "u", "Only the leader can rename the party")).toEqual({
      error: "Only the leader can rename the party",
      status: 403,
    });
  });

  it("refuses an ended party for its leader", async () => {
    found = { leaderId: "u", status: "ended" };
    expect(await loadPartyAsLeader("p", "u", "x")).toEqual({ error: "Party has ended", status: 400 });
  });

  it("hands back the document otherwise, and replies with its payload", async () => {
    const doc = { leaderId: "u", status: "forming", toObject: () => ({ id: "p" }) };
    found = doc;
    const loaded = await loadPartyAsLeader("p", "u", "x");
    expect("doc" in loaded && loaded.doc).toBe(doc);
    expect(await partyReply(doc)).toEqual({ party: { id: "p" }, status: 200 });
  });
});
