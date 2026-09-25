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
    expect(hostingSettingsSchema.parse(config).botFillPercent).toBe(0);
  });
});
