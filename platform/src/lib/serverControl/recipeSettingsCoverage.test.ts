/**
 * Every setting a game's profile declares must reach its server.
 *
 * A declared startup setting that the game-host recipe does not accept, or
 * accepts and never puts on the command line, is a control that silently does
 * nothing — customers of PlayBound Dedicated see it and trust it. This checks
 * each non-rcon setting against the real recipe: it must be accepted, and a
 * startup setting must change the arguments when its value changes, for party
 * rooms and managed (Community / Dedicated) rooms alike.
 */
import { describe, expect, it } from "vitest";
import { SERVER_SETTING_PROFILES, type ServerSettingDefinition } from "./settings";
import * as recipesModule from "../../../game-host/recipes.js";

const { recipes, acceptedSettingsFor } = recipesModule as {
  recipes: Record<string, { args?: (port: number, ctx: Record<string, unknown>, binary?: string) => string[] }>;
  acceptedSettingsFor: (slug: string, settings: Record<string, unknown>) => Record<string, unknown>;
};

// Profiles that share another recipe.
const RECIPE_FOR: Record<string, string> = { tes3mp: "morrowind", openhv: "openra", "0ad": "0-ad" };

function otherValue(def: ServerSettingDefinition) {
  if (def.type === "boolean") return !def.default;
  if (def.type === "number") {
    const up = def.default + 1;
    return def.max !== undefined && up > def.max ? def.default - 1 : up;
  }
  if (def.type === "enum") return def.options.find((o) => o.value !== def.default)?.value ?? def.default;
  return `${def.default}x`;
}

describe("declared server settings reach the server", () => {
  for (const [slug, profile] of Object.entries(SERVER_SETTING_PROFILES)) {
    const defs = profile.settings.filter((s) => s.backend !== "rcon");
    if (!defs.length) continue;
    const recipeSlug = RECIPE_FOR[slug] || slug;
    it(`${slug}: every startup setting is accepted and used`, () => {
      const recipe = recipes[recipeSlug];
      expect(recipe, `${slug} has no game-host recipe`).toBeTruthy();
      for (const def of defs) {
        const value = otherValue(def);
        const accepted = acceptedSettingsFor(recipeSlug, { [def.key]: value });
        expect(accepted, `${slug}.${def.key} is dropped by the agent`).toHaveProperty(def.key);
        if (def.backend !== "startup" || !recipe.args || def.feature === "slots") continue;
        for (const managed of [false, true]) {
          const ctx = { name: "t", partyId: "party-12345678", managed, settings: { maxPlayers: 8 } as Record<string, unknown> };
          const before = recipe.args(27000, ctx, "/bin/true").join(" ");
          const after = recipe.args(27000, { ...ctx, settings: { ...ctx.settings, [def.key]: value } }, "/bin/true").join(" ");
          expect(after, `${slug}.${def.key} does not change the ${managed ? "managed" : "party"} command line`).not.toBe(before);
        }
      }
    });
  }
});
