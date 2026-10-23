import { describe, expect, it } from "vitest";
import { applyPresenceFreshness, maskPresenceForOthers } from "@/lib/friends/presenceMask";

describe("LFG remains active after a browser heartbeat ends", () => {
  it("keeps the independent one-hour looking window while marking presence offline", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    const presence = {
      status: "online",
      lastHeartbeat: new Date(now - 3 * 60_000),
      lookingForPlayers: true,
      lookingForPlayersGameId: "openra",
      lookingForPlayersUntil: new Date(now + 30 * 60_000),
      currentGameId: "openra",
    };
    const result = applyPresenceFreshness(presence, now);
    expect(result.status).toBe("offline");
    expect(result.currentGameId).toBeNull();
    expect(result.lookingForPlayers).toBe(true);
    expect(result.lookingForPlayersGameId).toBe("openra");
    expect(applyPresenceFreshness(presence, now + 31 * 60_000).lookingForPlayers).toBe(false);
  });
});

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

  it("hides activity without forcing offline", () => {
    const presence = {
      status: "playing",
      currentGameId: "openra",
      currentGameTitle: "OpenRA",
    };
    const masked = maskPresenceForOthers(presence, false, true);
    expect(masked.status).toBe("online");
    expect(masked.currentGameId).toBeNull();
  });

  // The mask spreads presence and then nulls named fields, so any new field
  // is exposed by default rather than hidden. lookingForPlayersGameTitle was
  // added alongside the existing id and has to be cleared in both branches.
  it("clears the looking-for-players game title under both privacy modes", () => {
    const presence = {
      status: "online",
      lookingForPlayers: true,
      lookingForPlayersGameId: "villagers-and-heroes",
      lookingForPlayersGameTitle: "Villagers & Heroes",
    };

    const hidden = maskPresenceForOthers(presence, false, true);
    expect(hidden.lookingForPlayers).toBe(false);
    expect(hidden.lookingForPlayersGameId).toBeNull();
    expect(hidden.lookingForPlayersGameTitle).toBeNull();

    const offline = maskPresenceForOthers(presence, true, false);
    expect(offline.status).toBe("offline");
    expect(offline.lookingForPlayersGameTitle).toBeNull();
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
