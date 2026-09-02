import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  coerceSettingValues,
  controlFeatureSupport,
  defaultSettingValues,
  gamesSupporting,
  getServerSettingProfile,
  SERVER_SETTING_PROFILES,
  strongestApplyMode,
} from "./settings";

describe("server setting profiles", () => {
  it("describes what the agent already does, not something new", () => {
    /*
     * The agent runs on the VPS as its own deployable and cannot import this
     * schema, so the defaults exist twice. Reading its source is what stops
     * the copies drifting — the same trick launcher/services/itchDiagnose.test.js
     * uses, and the reason a schema that merely looked right would be worthless.
     */
    const recipesPath = fileURLToPath(
      new URL("../../../game-host/recipes.js", import.meta.url)
    );
    const src = fs.readFileSync(recipesPath, "utf8");
    const start = src.indexOf("export const WARZONE_DEFAULT_SETTINGS = {");
    expect(start, "WARZONE_DEFAULT_SETTINGS not found in recipes.js").not.toBe(-1);
    const open = src.indexOf("{", start);
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}" && --depth === 0) break;
    }
    const agentDefaults = new Function(`return ${src.slice(open, i + 1)};`)();

    expect(defaultSettingValues("warzone-2100")).toEqual(agentDefaults);
  });

  it("every setting a game declares has a default of its own type", () => {
    for (const profile of Object.values(SERVER_SETTING_PROFILES)) {
      for (const setting of profile.settings) {
        if (setting.type === "enum") {
          expect(
            setting.options.map((o) => o.value),
            `${profile.slug}.${setting.key} default is not one of its options`
          ).toContain(setting.default);
        } else {
          expect(typeof setting.default, `${profile.slug}.${setting.key}`).toBe(
            setting.type === "string" ? "string" : setting.type
          );
        }
      }
    }
  });

  it("has no duplicate keys within a game", () => {
    for (const profile of Object.values(SERVER_SETTING_PROFILES)) {
      const keys = profile.settings.map((s) => s.key);
      expect(new Set(keys).size, profile.slug).toBe(keys.length);
    }
  });

  it("is honest that Warzone cannot change anything without a restart", () => {
    // The agent writes a challenge JSON that Warzone reads once at spawn.
    // Claiming a live apply here would put a lie in front of the host.
    const profile = getServerSettingProfile("warzone-2100")!;
    expect(profile.settings.every((s) => s.apply === "restart")).toBe(true);
    expect(profile.settings.every((s) => s.backend === "config-file")).toBe(true);
  });

  it("returns nothing for a game with no profile", () => {
    // HoloCure is not hostable at all — it finds its own peers on a LAN
    // segment — so it will never acquire a server profile. Naming a merely
    // unprofiled game here means this test breaks every time coverage grows.
    expect(getServerSettingProfile("holocure")).toBe(null);
    expect(getServerSettingProfile(null)).toBe(null);
    expect(defaultSettingValues("holocure")).toEqual({});
  });
});

describe("apply cost of a change", () => {
  it("reports the worst mode among the keys being saved", () => {
    expect(strongestApplyMode("warzone-2100", ["map"])).toBe("restart");
    expect(strongestApplyMode("warzone-2100", ["map", "maxPlayers"])).toBe("restart");
  });

  it("says nothing when nothing known is changing", () => {
    expect(strongestApplyMode("warzone-2100", [])).toBe(null);
    expect(strongestApplyMode("warzone-2100", ["notASetting"])).toBe(null);
    expect(strongestApplyMode("holocure", ["map"])).toBe(null);
  });
});

describe("coercing host input", () => {
  it("keeps declared values", () => {
    const { values, rejected } = coerceSettingValues("warzone-2100", {
      map: "Sk-Rush",
      maxPlayers: 4,
      techLevel: 3,
    });
    expect(values).toEqual({ map: "Sk-Rush", maxPlayers: 4, techLevel: 3 });
    expect(rejected).toEqual([]);
  });

  it("drops anything the game does not declare", () => {
    // These end up in a file a game server parses on a machine we run, so the
    // schema is the boundary — an undeclared key never reaches an adapter.
    const { values, rejected } = coerceSettingValues("warzone-2100", {
      maxPlayers: 4,
      rconPassword: "hunter2",
      __proto__: { polluted: true },
    });
    expect(values).toEqual({ maxPlayers: 4 });
    expect(rejected.map((r) => r.key)).toContain("rconPassword");
  });

  it("enforces the declared bounds and options", () => {
    const { values, rejected } = coerceSettingValues("warzone-2100", {
      maxPlayers: 1,
      openSpectatorSlots: 99,
      techLevel: 9,
      map: 5,
    });
    expect(values).toEqual({});
    expect(rejected.map((r) => r.key).sort()).toEqual([
      "map",
      "maxPlayers",
      "openSpectatorSlots",
      "techLevel",
    ]);
    expect(rejected.find((r) => r.key === "maxPlayers")?.reason).toMatch(/minimum is 2/);
  });

  it("accepts a number with no declared maximum", () => {
    // maxPlayers is bounded by the map's slot count, which nothing knows yet,
    // so the schema declines to guess and the agent is left to refuse it.
    const { values, rejected } = coerceSettingValues("warzone-2100", { maxPlayers: 64 });
    expect(values).toEqual({ maxPlayers: 64 });
    expect(rejected).toEqual([]);
  });

  it("returns empty for a game with no profile rather than passing input through", () => {
    expect(coerceSettingValues("holocure", { map: "anything" })).toEqual({
      values: {},
      rejected: [],
    });
  });
});

describe("classifying what a game can be told to do", () => {
  function statusOf(slug: string, feature: string) {
    return controlFeatureSupport(slug).find((f) => f.feature === feature)!;
  }

  it("separates a game that cannot from a game nobody has looked at", () => {
    /*
     * The distinction the whole vocabulary exists for. Both of these render as
     * "no map control" and they are opposite instructions to whoever reads
     * them next: one is finished work, the other is a to-do.
     */
    expect(statusOf("freeciv", "map")).toMatchObject({ status: "unavailable" });
    expect(statusOf("warzone-2100", "bots")).toMatchObject({ status: "unassessed" });
  });

  it("keeps the reason with the refusal", () => {
    const freeciv = statusOf("freeciv", "map");
    expect(freeciv.status).toBe("unavailable");
    expect((freeciv as { reason: string }).reason).toMatch(/one map generated at the start/);

    const bots = statusOf("wolfenstein-enemy-territory", "bots");
    expect((bots as { reason: string }).reason).toMatch(/Omni-bot/);
  });

  it("reports a supported feature with what it costs", () => {
    // The same concept, two games, two very different prices.
    expect(statusOf("wolfenstein-enemy-territory", "map")).toMatchObject({
      status: "supported",
      key: "map",
      apply: "live",
    });
    expect(statusOf("warzone-2100", "map")).toMatchObject({
      status: "supported",
      key: "map",
      apply: "restart",
    });
  });

  it("recognises one concept across differently named settings", () => {
    // maxPlayers and sv_maxclients are the same question asked twice.
    expect(statusOf("warzone-2100", "slots")).toMatchObject({ key: "maxPlayers" });
    expect(statusOf("wolfenstein-enemy-territory", "slots")).toMatchObject({
      key: "sv_maxclients",
    });
    const slots = gamesSupporting("slots");
    expect(slots).toContain("warzone-2100");
    expect(slots).toContain("wolfenstein-enemy-territory");
    // Whatever the list grows to, every entry has to have earned its place.
    for (const slug of slots) {
      expect(
        SERVER_SETTING_PROFILES[slug].settings.some((x) => x.feature === "slots"),
        slug
      ).toBe(true);
    }
  });

  it("answers for a game with no profile at all", () => {
    for (const entry of controlFeatureSupport("holocure")) {
      expect(entry.status).toBe("unassessed");
    }
  });

  it("gives every feature a label, so nothing renders as a key", () => {
    for (const entry of controlFeatureSupport("freeciv")) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.label).not.toBe(entry.feature);
    }
  });

  it("never claims a game both supports and cannot have the same thing", () => {
    for (const profile of Object.values(SERVER_SETTING_PROFILES)) {
      for (const [feature, reason] of Object.entries(profile.unavailable ?? {})) {
        expect(
          profile.settings.some((s) => s.feature === feature),
          `${profile.slug} declares ${feature} and also says it cannot: ${reason}`
        ).toBe(false);
      }
    }
  });
});

describe("coverage of the games PlayBound hosts", () => {
  /*
   * Hostable games with no profile yet. Emptying this list is the goal; adding
   * to it is how a new hostable game is admitted without silently having no
   * server controls.
   *
   * Each entry is a real gap, not a shrug — the reason is what the next person
   * needs in order to close it.
   */
  const UNASSESSED: Record<string, string> = {
    /*
     * The last one, and it is blocked rather than unexamined. Mindustry is
     * configured over stdin with `host <map> <mode>`, and the mode cannot be
     * given without naming a map — so it needs the GameMap entity before it
     * needs anything here. See "Deferred on purpose" in docs/server-control.md.
     */
    mindustry:
      "Configured over stdin with host <map> <mode>; the mode cannot be set without naming a map, so it needs the map entity first.",
  };




  it("accounts for every hostable game, either with a profile or a reason", async () => {
    const { HOSTABLE_GAMES } = await import("@/lib/gameHost/catalog");
    const missing: string[] = [];
    for (const slug of Object.keys(HOSTABLE_GAMES)) {
      if (SERVER_SETTING_PROFILES[slug]) continue;
      if (UNASSESSED[slug]) continue;
      missing.push(slug);
    }
    expect(
      missing,
      `these hostable games have neither a settings profile nor an entry in UNASSESSED: ${missing.join(", ")}`
    ).toEqual([]);
  });

  /*
   * A profile for a game PlayBound does not host is not wrong, but it is
   * unreachable: serverControlAvailability answers "PlayBound does not host X
   * servers" before any of it is read. Teeworlds is the case — the agent has a
   * full recipe that writes a six-value config file, so the settings are real,
   * but the slug is absent from HOSTABLE_GAMES and its adapter row says
   * "official", which means leave the game's own networking alone.
   *
   * Listing it keeps that visible. A profile turning up here that nobody meant
   * to write is what this catches.
   */
  const READY_BUT_NOT_HOSTED: Record<string, string> = {
    teeworlds:
      "The agent has a full recipe, but the slug is not in HOSTABLE_GAMES and its adapter is official — so nothing ever asks for a Teeworlds room.",
  };

  it("knows which profiles are for games PlayBound does not actually host", async () => {
    const { isHostableGame } = await import("@/lib/gameHost/catalog");
    const unreachable = Object.keys(SERVER_SETTING_PROFILES).filter((s) => !isHostableGame(s));
    const undocumented = unreachable.filter((s) => !READY_BUT_NOT_HOSTED[s]);
    expect(
      undocumented,
      `profiles for games PlayBound does not host, with no note saying why: ${undocumented.join(", ")}`
    ).toEqual([]);
  });

  it("does not keep a game on the unassessed list once it has a profile", () => {
    const stale = Object.keys(UNASSESSED).filter((slug) => SERVER_SETTING_PROFILES[slug]);
    expect(stale, `assessed, but still listed as unassessed: ${stale.join(", ")}`).toEqual([]);
  });
});
