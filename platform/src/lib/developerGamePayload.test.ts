import { describe, it, expect } from "vitest";
import {
  developerGamePayloadSchema,
  FORBIDDEN_EDITORIAL_FIELDS,
} from "./developerGamePayload";

describe("developerGamePayloadSchema", () => {
  const validBase = {
    tagline: "A fast-paced community arena shooter",
    description: "Battle friends in custom arenas with retro graphics and online netplay.",
    website: "https://example.com/arenashooter",
    githubRepo: "studio/arenashooter",
    genres: ["FPS", "Action"],
    tags: ["Pixel Art", "Retro"],
    aliases: ["ArenaShooter"],
    license: "GPL-3.0",
    releaseYear: 2024,
    sizeMB: 350,
    platforms: ["Windows", "Linux"],
    features: ["Multiplayer", "Co-op"],
    maxPlayers: 16,
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: true,
    steamAppId: "123456",
    coverImage: "https://example.com/cover.jpg",
    screenshots: ["https://example.com/shot1.jpg"],
    videos: [],
    systemRequirements: {
      min: "Windows 10, 4GB RAM",
      recommended: "Windows 11, 8GB RAM",
    },
  };

  it("validates a compliant developer payload", () => {
    const result = developerGamePayloadSchema.parse(validBase);
    expect(result.tagline).toBe(validBase.tagline);
    expect(result.releaseYear).toBe(2024);
    expect(result.maxPlayers).toBe(16);
    expect(result.systemRequirements.min).toBe("Windows 10, 4GB RAM");
  });

  it("strictly strips every forbidden editorial field", () => {
    const maliciousPayload = {
      ...validBase,
      // Attempting to overwrite PlayBound quality bar assessment
      qualityBar: {
        genuinelyFree: true,
        finished: true,
        activelyMaintained: true,
        standsAlone: true,
        highQuality: true,
        verdict: "Developer injected verdict: The greatest game ever!",
      },
      whyWePickedIt: "Developer wrote this: It is amazing because we said so.",
      thatOneThing: "Developer wrote this.",
      bestFor: ["Everyone in the world"],
      notFor: [],
      comparableTo: ["Half-Life 3"],
      gameOfWeek: true,
      hiddenGem: true,
      masterCopy: true,
      complete: true,
      access: { priceType: "FREE" },
      status: "published",
      published: true,
      playboundSupported: true,
      serverLobbyAuth: { username: "admin", password: "compromised" },
      ownerUserId: "fake-user-id",
      managedBy: "developer",
    };

    const parsed = developerGamePayloadSchema.parse(maliciousPayload) as Record<string, unknown>;

    for (const field of FORBIDDEN_EDITORIAL_FIELDS) {
      expect(parsed).not.toHaveProperty(field);
    }
  });
});
