import { describe, expect, it } from "vitest";
import { DEVELOPER_GAME_SELECT, developerGameResponse } from "./developerGameResponse";

describe("developer game response", () => {
  it("keeps editor fields and read-only review while excluding ownership, credentials and internal data", () => {
    const game = developerGameResponse({
      slug: "example", title: "Example", tagline: "Test", status: "published",
      qualityBar: { verdict: "Worth playing" }, whyWePickedIt: "Good multiplayer",
      coverImage: "https://example.com/cover.jpg", launcherInstall: { kind: "external" },
      communityLinks: {
        officialDiscord: { inviteUrl: "https://discord.gg/example", serverName: "Example", verifiedSourceUrl: "private" },
        playboundDiscord: { inviteCode: "private-code" },
      },
      serverLobbyAuth: { username: "admin", password: "secret" },
      ownerUserId: "owner", developerSlug: "studio", submissionId: "private",
      adminUpdatedAt: new Date(), access: { retailOffers: [] },
    });

    expect(game).toMatchObject({ slug: "example", tagline: "Test", qualityBar: { verdict: "Worth playing" } });
    expect(game.communityLinks).toEqual({ officialDiscord: { inviteUrl: "https://discord.gg/example", serverName: "Example" } });
    for (const key of ["serverLobbyAuth", "ownerUserId", "developerSlug", "submissionId", "adminUpdatedAt", "access"]) {
      expect(game).not.toHaveProperty(key);
    }
  });

  it("does not fetch credential or private community-link fields from Mongo", () => {
    const selected = new Set(DEVELOPER_GAME_SELECT.split(" "));
    expect(selected).toContain("ownerUserId"); // authorization needs it
    for (const key of ["serverLobbyAuth", "submissionId", "access", "communityLinks", "communityLinks.playboundDiscord"]) {
      expect(selected).not.toContain(key);
    }
  });
});
