import { describe, expect, it } from "vitest";
import { partyLanAddresses } from "./peers";

describe("party overlay addresses", () => {
  it("returns the leader separately even when another guest appears first", () => {
    const members = [
      { userId: "guest-a", lanAddress: "100.64.1.2" },
      { userId: "guest-b", lanAddress: "100.64.1.3" },
      { userId: "leader", lanAddress: "100.64.1.1" },
    ];
    expect(partyLanAddresses(members, "guest-b", "leader")).toEqual({
      peerAddresses: ["100.64.1.2", "100.64.1.1"],
      hostAddress: "100.64.1.1",
    });
    expect(partyLanAddresses(members, "leader", "leader").hostAddress).toBeNull();
  });

  it("does not return an invalid or missing leader address", () => {
    expect(partyLanAddresses([
      { userId: "guest", lanAddress: "100.64.1.2" },
      { userId: "leader", lanAddress: "8.8.8.8" },
    ], "guest", "leader")).toEqual({ peerAddresses: [], hostAddress: null });
  });
});
