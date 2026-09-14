import { describe, expect, it } from "vitest";
import { canLaunch, type RuleParty } from "./partyRules";

describe("canLaunch", () => {
  const joinedAt = new Date("2026-01-01T00:00:00Z");
  const party: RuleParty = {
    leaderId: "leader",
    status: "forming",
    visibility: "friends",
    maxSize: 4,
    members: [
      { userId: "leader", role: "leader", ready: true, joinedAt },
      { userId: "guest", role: "member", ready: false, joinedAt },
    ],
  };

  it("refuses when any member is not ready", () => {
    const check = canLaunch(party, "leader");
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/ready up/i);
  });

  it("allows the leader once everyone is ready", () => {
    const check = canLaunch(
      {
        ...party,
        members: [
          { userId: "leader", role: "leader", ready: true, joinedAt },
          { userId: "guest", role: "member", ready: true, joinedAt },
        ],
      },
      "leader"
    );
    expect(check.ok).toBe(true);
  });
});
