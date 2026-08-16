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
  });

  it("does not host closed platforms or lobby-only titles", () => {
    expect(isHostableGame("counter-strike-2")).toBe(false);
    expect(isHostableGame("league-of-legends")).toBe(false);
    expect(isHostableGame("beyond-all-reason")).toBe(false);
    expect(isHostableGame("0ad")).toBe(false);
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

  it("returns an empty hosted payload with enabled=true for hostable slugs", () => {
    const p = emptyHostedPayload("openra");
    expect(p.enabled).toBe(true);
    expect(p.status).toBe("none");
    expect(p.host).toBeNull();
    expect(emptyHostedPayload("holocure").enabled).toBe(false);
  });
});
