import { describe, expect, it } from "vitest";
import { canLaunch } from "./partyRules";

describe("canLaunch", () => {
  const party = {
    leaderId: "leader",
    status: "forming" as const,
    members: [
      { userId: "leader", ready: true },
      { userId: "guest", ready: false },
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
          { userId: "leader", ready: true },
          { userId: "guest", ready: true },
        ],
      },
      "leader"
    );
    expect(check.ok).toBe(true);
  });
});
