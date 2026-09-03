import { describe, expect, it } from "vitest";
import {
  HOSTABLE_GAMES,
  emptyHostedPayload,
  getHostableGame,
  isHostableGame,
} from "./catalog";

describe("game host catalog", () => {
  it("marks listen-server games as hostable", () => {
    expect(isHostableGame("openra")).toBe(true);
    expect(isHostableGame("openttd")).toBe(true);
    expect(isHostableGame("luanti")).toBe(true);
    expect(isHostableGame("mindustry")).toBe(true);
    expect(isHostableGame("hedgewars")).toBe(true);
    expect(isHostableGame("warzone-2100")).toBe(true);
    expect(isHostableGame("freeciv")).toBe(true);
    expect(isHostableGame("bzflag")).toBe(true);
    expect(isHostableGame("supertuxkart")).toBe(true);
    expect(isHostableGame("triplea")).toBe(true);
    expect(isHostableGame("wolfenstein-enemy-territory")).toBe(true);
    expect(isHostableGame("openarena")).toBe(true);
    expect(isHostableGame("ysoccer")).toBe(true);
    expect(isHostableGame("xonotic")).toBe(true);
    expect(isHostableGame("unvanquished")).toBe(true);
    expect(isHostableGame("battle-for-wesnoth")).toBe(true);
    expect(isHostableGame("team-fortress-2")).toBe(true);
    expect(isHostableGame("tf2")).toBe(true);
    expect(isHostableGame("counter-strike-2")).toBe(true);
    expect(isHostableGame("cs2")).toBe(true);
    expect(isHostableGame("veloren")).toBe(true);
    expect(isHostableGame("freedoom")).toBe(true);
    expect(isHostableGame("space-station-14")).toBe(true);
    expect(isHostableGame("flightgear")).toBe(true);
    expect(isHostableGame("openhv")).toBe(true);
    expect(isHostableGame("re-volt-rvgl")).toBe(true);
    /*
     * Zero-K is played through its own lobby, not a room PlayBound provisions.
     * It was listed here with a recipe that spring-dedicated could not accept —
     * see the note in catalog.ts.
     */
    expect(isHostableGame("zero-k")).toBe(false);
    expect(isHostableGame("chris-sawyers-locomotion")).toBe(false);
    expect(isHostableGame("renegade-x")).toBe(false);
    expect(isHostableGame("gemrb")).toBe(false);
    expect(isHostableGame("mrboom")).toBe(false);

    /*
     * The catalog publishes 0 A.D. as `0ad`, while this catalog and the
     * agent's recipes.js both call it `0-ad`. Both spellings must resolve.
     */
    expect(isHostableGame("0-ad")).toBe(true);
    expect(isHostableGame("0ad")).toBe(true);
    expect(getHostableGame("openmohaa")?.slug).toBe("medal-of-honor-allied-assault");
  });

  it("does not host closed platforms or lobby-only titles", () => {
    expect(isHostableGame("league-of-legends")).toBe(false);
    expect(isHostableGame("beyond-all-reason")).toBe(false);
    expect(isHostableGame("keeperfx")).toBe(false);
    expect(isHostableGame("marathon-2")).toBe(false);
    expect(isHostableGame("holocure")).toBe(false);
    expect(isHostableGame("")).toBe(false);
    expect(isHostableGame(null)).toBe(false);
  });

  it("gives each game a non-overlapping default port", () => {
    const used = new Set<number>();
    for (const game of Object.values(HOSTABLE_GAMES)) {
      expect(game.portEnd).toBeGreaterThanOrEqual(game.defaultPort);
      expect(used.has(game.defaultPort)).toBe(false);
      used.add(game.defaultPort);
      expect(getHostableGame(game.slug)?.slug).toBe(game.slug);
    }
  });

  /*
   * The VPS firewall is generated from recipes.js while the site reasons about
   * hosting from this catalog. When the two disagreed on OpenRA — udp here, tcp
   * in reality — the dedicated server ran perfectly and every client's
   * handshake was dropped at the firewall, which is invisible from either file
   * alone. So they are asserted equal.
   */
  it("agrees with the host agent's recipes on ports and protocol", async () => {
    const { recipes } = await import("../../../game-host/recipes.js");

    for (const [slug, game] of Object.entries(HOSTABLE_GAMES)) {
      const recipe = (recipes as Record<string, { portStart: number; portEnd: number; protocol: string }>)[slug];
      expect(recipe, `no recipe for hostable game ${slug}`).toBeDefined();
      expect(recipe.portStart, `${slug} portStart`).toBe(game.defaultPort);
      expect(recipe.portEnd, `${slug} portEnd`).toBe(game.portEnd);
      expect(recipe.protocol, `${slug} protocol`).toBe(game.protocol);
    }
  });

  it("uses supported headless 0 A.D. autostart options", async () => {
    const { recipes } = await import("../../../game-host/recipes.js");
    const args = recipes["0-ad"].args(20595, { maxPlayers: 4 });
    expect(args).toContain("-autostart=random/mainland");
    expect(args).toContain("-autostart-host");
    expect(args).toContain("-autostart-nonvisual");
    expect(args).not.toContain("-autostart-headless");
    expect(args.some((arg: string) => arg.startsWith("--port="))).toBe(false);
  });

  it("keeps BZFlag party rooms off the distro-owned default port", async () => {
    const { recipes } = await import("../../../game-host/recipes.js");
    const recipe = recipes.bzflag;
    expect(recipe.portStart).toBe(5155);
    expect(recipe.args(5155)).toEqual(
      expect.arrayContaining(["-p", "5155", "-offa", "-q"])
    );
  });

  it("returns an empty hosted payload with enabled=true for hostable slugs", () => {
    const p = emptyHostedPayload("openra");
    expect(p.enabled).toBe(true);
    expect(p.status).toBe("none");
    expect(p.host).toBeNull();
    expect(emptyHostedPayload("holocure").enabled).toBe(false);
  });
});
