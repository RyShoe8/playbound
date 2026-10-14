import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { getMultiplayerAdapter } from "@/lib/multiplayer/adapters";
import { defaultSettingValues, getServerSettingProfile } from "./settings";

const require = createRequire(import.meta.url);
const { buildServerArgs } = require("../../../../launcher/services/localServer.js");
const { localSettingsEngine } = require("../../../../launcher/services/localServerSettings.js");

describe("declared local settings reach the native engine builder", () => {
  it.each(["openra", "openhv", "teeworlds", "bzflag", "openarena", "wolfenstein-enemy-territory", "medal-of-honor-allied-assault", "xonotic", "morrowind"])("covers every declared setting for %s", (slug) => {
    const hostLaunch = getMultiplayerAdapter(slug).host;
    expect(localSettingsEngine(hostLaunch)).toBeTruthy();
    const profile = getServerSettingProfile(slug);
    expect(profile).toBeTruthy();
    expect(() => buildServerArgs({ hostLaunch, port: 1234, serverName: "Alice's party", settings: defaultSettingValues(slug) })).not.toThrow();
    for (const definition of profile!.settings) {
      const values = definition.type === "enum" ? definition.options.map((option) => option.value) : [definition.default];
      for (const value of values) expect(() => buildServerArgs({ hostLaunch, port: 1234, settings: { [definition.key]: value } })).not.toThrow();
    }
  });
  it("retains OpenE2140's explicit mod without enabling unassessed controls", () => {
    const hostLaunch = getMultiplayerAdapter("earth-2140-trilogy").host;
    const args = buildServerArgs({ hostLaunch, port: 1234, settings: {} });
    expect(args).toContain("Game.Mod=e2140");
    expect(args).not.toContain("+set");
    expect(getServerSettingProfile("earth-2140-trilogy")).toBeNull();
  });
});
