import { describe, expect, it } from "vitest";
import { partyConnectCanAutoProvision } from "./connect";
import type { PartyDoc } from "./types";

function party(hostMode: "self" | "public", status: "forming" | "playing", ready: boolean): PartyDoc {
  return {
    gameSlug: "hedgewars",
    hostMode,
    status,
    members: [{ userId: "leader", role: "leader", ready }, { userId: "friend", role: "member", ready }],
  } as unknown as PartyDoc;
}

describe("party connection provisioning", () => {
  it("starts a self-hosted network as soon as the mode is chosen", () => {
    expect(partyConnectCanAutoProvision(party("self", "forming", false))).toBe(true);
  });

  it("keeps dedicated/public readiness gates and does not provision a live session", () => {
    expect(partyConnectCanAutoProvision(party("public", "forming", false))).toBe(false);
    expect(partyConnectCanAutoProvision(party("self", "playing", true))).toBe(false);
  });
});
