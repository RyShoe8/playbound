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
