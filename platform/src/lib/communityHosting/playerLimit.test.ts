import { describe, expect, it } from "vitest";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import { hostingSettingsSchema } from "./settings";

describe("community hosting player limit", () => {
  it("defaults to 16 and bounds the admin setting", () => {
    const config = new CommunityHostingConfig({ key: "global" }).toObject();
    expect(config.maxPlayersPerServer).toBe(16);
    expect(hostingSettingsSchema.parse(config).maxPlayersPerServer).toBe(16);
    expect(hostingSettingsSchema.safeParse({ ...config, maxPlayersPerServer: 1 }).success).toBe(false);
    expect(hostingSettingsSchema.safeParse({ ...config, maxPlayersPerServer: 65 }).success).toBe(false);
  });
});

describe("community hosting bot fill", () => {
  it("fills a share of slots, keeps one free, and only for bot-capable engines", async () => {
    const { botFillFor, managedRoomSettings } = await import("./reconcile");
    expect(botFillFor(16, 50)).toBe(8);
    expect(botFillFor(16, 100)).toBe(15);
    expect(botFillFor(16, 0)).toBe(0);
    expect(managedRoomSettings("counter-strike-2", { maxPlayersPerServer: 16, botFillPercent: 25 })).toEqual({ maxPlayers: 16, botFill: 4 });
    expect(managedRoomSettings("luanti", { maxPlayersPerServer: 16, botFillPercent: 25 })).toEqual({ maxPlayers: 16 });
    const config = new CommunityHostingConfig({ key: "global" }).toObject();
    expect(config.botFillPercent).toBe(50);
    expect(hostingSettingsSchema.parse(config).botFillPercent).toBe(50);
  });

  it("reports an OpenMOHAA room that did not apply or activate its requested bots", async () => {
    const { botFillIssue } = await import("./reconcile");
    const now = new Date("2026-09-29T12:00:00Z");
    const startedAt = now.getTime() - 10 * 60_000;
    expect(botFillIssue(8, {}, 0, startedAt, now)).toBe("BOT_FILL_NOT_APPLIED");
    expect(botFillIssue(8, { botFill: 8 }, 0, startedAt, now)).toBe("BOT_FILL_INACTIVE");
    expect(botFillIssue(8, { botFill: 8 }, 0, now.getTime() - 60_000, now)).toBeNull();
    expect(botFillIssue(8, { botFill: 8 }, 8, startedAt, now)).toBeNull();
    expect(botFillIssue(0, {}, 0, startedAt, now)).toBeNull();
    expect(botFillIssue(8, {}, null, startedAt, now)).toBeNull();
  });
});

describe("community hosting settings drift", () => {
  it("detects drift when current maxPlayers differs from desired", async () => {
    const { hasSettingsDrift } = await import("./reconcile");
    // Room reports 32, desired is 16 -> drift
    expect(hasSettingsDrift({ maxPlayers: 16 }, { maxPlayers: 32 }, {})).toBe(true);
    // Room reports 16, desired is 16 -> no drift
    expect(hasSettingsDrift({ maxPlayers: 16 }, { maxPlayers: 16 }, {})).toBe(false);
  });

  it("does not falsely trigger drift when agent room omits maxPlayers but server has it", async () => {
    const { hasSettingsDrift } = await import("./reconcile");
    // Freedoom / agent omits maxPlayers in room.settings, but server record has 16 -> no drift!
    expect(hasSettingsDrift({ maxPlayers: 16 }, {}, { maxPlayers: 16 })).toBe(false);
    expect(hasSettingsDrift({ maxPlayers: 16 }, {}, {}, 16)).toBe(false);
  });

  it("detects drift when admin updates desired settings and server has old limit", async () => {
    const { hasSettingsDrift } = await import("./reconcile");
    // Admin bumped desired from 16 to 24, server was 16 -> drift
    expect(hasSettingsDrift({ maxPlayers: 24 }, {}, { maxPlayers: 16 })).toBe(true);
  });
});
