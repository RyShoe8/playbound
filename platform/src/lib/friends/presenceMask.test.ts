import { describe, expect, it } from "vitest";
import { maskPresenceForOthers } from "@/lib/friends/presenceMask";

describe("maskPresenceForOthers", () => {
  it("returns presence unchanged when appearOffline is false", () => {
    const presence = {
      status: "playing",
      currentGameId: "openra",
      currentGameTitle: "OpenRA",
      currentEditionId: null,
      currentPage: "/games/openra",
      platform: "desktop",
    };
    expect(maskPresenceForOthers(presence, false)).toEqual(presence);
  });

  it("forces offline and clears game fields when appearOffline is true", () => {
    const presence = {
      status: "playing",
      currentGameId: "openra",
      currentGameTitle: "OpenRA",
      currentEditionId: "main",
      currentPage: "/games/openra",
      platform: "desktop",
      lastHeartbeat: new Date("2026-01-01"),
    };
    const masked = maskPresenceForOthers(presence, true);
    expect(masked.status).toBe("offline");
    expect(masked.currentGameId).toBeNull();
    expect(masked.currentGameTitle).toBeNull();
    expect(masked.currentEditionId).toBeNull();
    expect(masked.currentPage).toBeNull();
    expect(masked.platform).toBeUndefined();
    expect(masked.lastHeartbeat).toEqual(presence.lastHeartbeat);
  });
});

describe("friendship status mapping", () => {
  function mapStatus(
    rel: { status: string; requesterId: string; recipientId: string } | null,
    viewerId: string
  ): string {
    if (!rel) return "none";
    if (rel.status === "accepted") return "friends";
    if (rel.status === "blocked") return "blocked";
    if (rel.status === "pending") {
      return rel.requesterId === viewerId ? "outgoing_request" : "incoming_request";
    }
    return "none";
  }

  it("maps accepted / pending / declined correctly", () => {
    expect(mapStatus(null, "a")).toBe("none");
    expect(mapStatus({ status: "accepted", requesterId: "a", recipientId: "b" }, "a")).toBe("friends");
    expect(mapStatus({ status: "pending", requesterId: "a", recipientId: "b" }, "a")).toBe(
      "outgoing_request"
    );
    expect(mapStatus({ status: "pending", requesterId: "a", recipientId: "b" }, "b")).toBe(
      "incoming_request"
    );
    expect(mapStatus({ status: "declined", requesterId: "a", recipientId: "b" }, "a")).toBe("none");
    expect(mapStatus({ status: "cancelled", requesterId: "a", recipientId: "b" }, "a")).toBe("none");
    expect(mapStatus({ status: "blocked", requesterId: "a", recipientId: "b" }, "a")).toBe("blocked");
  });
});
