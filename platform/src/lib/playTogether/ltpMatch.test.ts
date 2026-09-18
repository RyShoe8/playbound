import { describe, expect, it } from "vitest";
import {
  findGameOverlap,
  isUserPairBlocked,
  selectBestPartyForLookingUser,
} from "./ltpMatch";

describe("findGameOverlap", () => {
  it("finds matching game when selections overlap", () => {
    const userA = ["openra", "xonotic"];
    const userB = ["xonotic", "supertuxkart"];
    expect(findGameOverlap(userA, userB)).toBe("xonotic");
  });

  it("returns null when there is no overlap", () => {
    const userA = ["openra"];
    const userB = ["xonotic", "supertuxkart"];
    expect(findGameOverlap(userA, userB)).toBe(null);
  });

  it("handles empty arrays gracefully", () => {
    expect(findGameOverlap([], ["xonotic"])).toBe(null);
    expect(findGameOverlap(["xonotic"], [])).toBe(null);
  });
});

describe("isUserPairBlocked", () => {
  const blocks = [
    { requesterId: "user_1", recipientId: "user_2" },
    { requesterId: "user_3", recipientId: "user_4" },
  ];

  it("identifies blocked pairs in both directions", () => {
    expect(isUserPairBlocked(blocks, "user_1", "user_2")).toBe(true);
    expect(isUserPairBlocked(blocks, "user_2", "user_1")).toBe(true);
    expect(isUserPairBlocked(blocks, "user_3", "user_4")).toBe(true);
  });

  it("returns false for non-blocked pairs", () => {
    expect(isUserPairBlocked(blocks, "user_1", "user_3")).toBe(false);
    expect(isUserPairBlocked(blocks, "user_2", "user_4")).toBe(false);
    expect(isUserPairBlocked(blocks, "user_5", "user_6")).toBe(false);
  });
});

describe("selectBestPartyForLookingUser", () => {
  const blocks = [{ requesterId: "user_bad", recipientId: "user_looking" }];

  it("selects open party with space when not blocked", () => {
    const parties = [
      { id: "party_1", memberCount: 2, maxSize: 4 },
      { id: "party_2", memberCount: 4, maxSize: 4 }, // full
    ];
    const partyMembers = new Map([
      ["party_1", ["user_a", "user_b"]],
      ["party_2", ["user_c", "user_d", "user_e", "user_f"]],
    ]);

    const chosen = selectBestPartyForLookingUser(parties, partyMembers, "user_looking", blocks);
    expect(chosen).toBe("party_1");
  });

  it("skips party containing blocked user", () => {
    const parties = [
      { id: "party_1", memberCount: 1, maxSize: 4 },
      { id: "party_2", memberCount: 1, maxSize: 4 },
    ];
    const partyMembers = new Map([
      ["party_1", ["user_bad"]], // contains blocked user
      ["party_2", ["user_friend"]],
    ]);

    const chosen = selectBestPartyForLookingUser(parties, partyMembers, "user_looking", blocks);
    expect(chosen).toBe("party_2");
  });

  it("returns null when no compatible party with space exists", () => {
    const parties = [{ id: "party_full", memberCount: 4, maxSize: 4 }];
    const partyMembers = new Map([["party_full", ["user_a", "user_b", "user_c", "user_d"]]]);

    const chosen = selectBestPartyForLookingUser(parties, partyMembers, "user_looking", blocks);
    expect(chosen).toBe(null);
  });
});
