import { describe, expect, it } from "vitest";
import { isMultiplayerGame } from "@/lib/playTogether/multiplayer";
import { resolveJoinCapability } from "@/lib/playTogether/joinCapability";
import { maskPresenceForOthers } from "@/lib/friends/presenceMask";
import {
  canRecipientRespond,
  canSenderCancel,
  isDuplicatePendingInvite,
  nextInviteStatus,
} from "@/lib/playTogether/inviteRules";
import { getPartyCapability } from "@/lib/playTogether/party";
import { LFG_TTL_MS } from "@/lib/playTogether/types";

describe("isMultiplayerGame", () => {
  it("detects Multiplayer feature", () => {
    expect(
      isMultiplayerGame({ features: ["Multiplayer", "Mod Support"], tags: ["RTS"] })
    ).toBe(true);
  });

  it("detects Co-op tag", () => {
    expect(isMultiplayerGame({ features: ["Campaign"], tags: ["Co-op"] })).toBe(true);
  });

  it("returns false for single-player only", () => {
    expect(
      isMultiplayerGame({ features: ["Singleplayer Campaign"], tags: ["Story"] })
    ).toBe(false);
  });
});

describe("resolveJoinCapability", () => {
  it("unsupported when friend is not playing", () => {
    const r = resolveJoinCapability({
      game: {
        slug: "openra",
        title: "OpenRA",
        features: ["Multiplayer"],
        tags: [],
        browserPlayable: false,
      },
      friendStatus: "online",
      friendGameId: "openra",
    });
    expect(r.capability).toBe("unsupported");
  });

  it("unsupported for single-player games", () => {
    const r = resolveJoinCapability({
      game: {
        slug: "story-game",
        title: "Story",
        features: ["Singleplayer"],
        tags: [],
        browserPlayable: false,
      },
      friendStatus: "playing",
      friendGameId: "story-game",
    });
    expect(r.capability).toBe("unsupported");
  });

  it("requiresManualJoin for multiplayer without server browser", () => {
    const r = resolveJoinCapability({
      game: {
        slug: "made-up-mp",
        title: "Made Up",
        features: ["Multiplayer"],
        tags: [],
        browserPlayable: false,
      },
      friendStatus: "playing",
      friendGameId: "made-up-mp",
    });
    expect(["supported", "requiresManualJoin"]).toContain(r.capability);
    expect(r.href).toBeTruthy();
  });
});

describe("maskPresenceForOthers hideActivity", () => {
  it("hides game details but keeps online when hideActivity is set", () => {
    const masked = maskPresenceForOthers(
      {
        status: "playing",
        currentGameId: "openra",
        currentGameTitle: "OpenRA",
        lookingForPlayers: true,
      },
      false,
      true
    );
    expect(masked.status).toBe("online");
    expect(masked.currentGameId).toBeNull();
    expect(masked.lookingForPlayers).toBe(false);
  });
});

describe("play invite status machine", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const future = new Date("2026-01-02T12:00:00Z");
  const past = new Date("2026-01-01T11:00:00Z");

  it("accepts/declines/cancels pending invites", () => {
    expect(nextInviteStatus("pending", "accept", now, future).status).toBe("accepted");
    expect(nextInviteStatus("pending", "decline", now, future).status).toBe("declined");
    expect(nextInviteStatus("pending", "cancel", now, future).status).toBe("cancelled");
    expect(canRecipientRespond("pending")).toBe(true);
    expect(canSenderCancel("pending")).toBe(true);
  });

  it("expires overdue pending invites", () => {
    const r = nextInviteStatus("pending", "accept", now, past);
    expect(r.status).toBe("expired");
    expect(r.error).toBe("Invite expired");
  });

  it("blocks responses after settle", () => {
    expect(nextInviteStatus("accepted", "decline", now, future).error).toBeTruthy();
    expect(canRecipientRespond("declined")).toBe(false);
    expect(isDuplicatePendingInvite({ existingPending: true })).toBe(true);
  });
});

describe("LFG TTL + party extension", () => {
  it("uses 60 minute LFG window", () => {
    expect(LFG_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("leaves party creation as future/unsupported", () => {
    expect(getPartyCapability().supported).toBe(false);
  });
});
