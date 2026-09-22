import { describe, expect, it } from "vitest";
import {
  listedEditionsFromStored,
  mergeStoredAndSeedEditions,
  parseSeedEditionId,
} from "./editions";
import type { Game } from "@/lib/data/types";
import type { Edition } from "@/lib/editionTypes";

describe("seed edition deletion", () => {
  it("parses the synthetic id used by the admin edit and delete routes", () => {
    expect(parseSeedEditionId("seed:holocure:official")).toEqual({
      gameSlug: "holocure",
      slug: "official",
    });
  });

  it("does not merge a seed back in when a deletion tombstone owns its slug", () => {
    const visible = mergeStoredAndSeedEditions(
      "holocure",
      [],
      new Set(["official"])
    );

    expect(visible.some((edition) => edition.slug === "official")).toBe(false);
  });

  it("still returns the seed when no stored row or tombstone owns its slug", () => {
    const visible = mergeStoredAndSeedEditions("holocure", [], new Set());
    expect(visible.some((edition) => edition.slug === "official")).toBe(true);
  });

  it("strips misparented OpenE2140 from openra edition lists", () => {
    const visible = mergeStoredAndSeedEditions(
      "openra",
      [
        {
          id: "bad",
          gameSlug: "openra",
          slug: "opene2140",
          name: "OpenE2140",
          status: "active",
          visibility: "public",
        } as never,
      ],
      new Set()
    );
    expect(visible.some((edition) => edition.slug === "opene2140")).toBe(false);
    expect(visible.some((edition) => edition.slug === "official")).toBe(true);
  });
});

describe("listedEditionsFromStored", () => {
  const game = { slug: "holocure", title: "HoloCure", tagline: "" } as Game;

  it("synthesizes a virtual official edition when nothing is stored", () => {
    const listed = listedEditionsFromStored(game, []);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.slug).toBe("official");
    expect(listed[0]?.virtual).toBe(true);
  });
});

describe("the base game beside its editions", () => {
  /*
   * Alien Swarm's real shape: a Steam game (app 630) with one community
   * edition, Reactive Drop, which is a different Steam app (563560). Adding
   * that edition used to hide the base game, because a game with any stored
   * edition listed only stored editions.
   */
  const alienSwarm = {
    slug: "alien-swarm",
    title: "Alien Swarm",
    platforms: ["Windows"],
    launcherInstall: { enabled: true, kind: "external", url: "steam://install/630" },
  } as unknown as Game;

  const reactiveDrop = {
    id: "rd",
    gameSlug: "alien-swarm",
    slug: "alien-swarm-reactive-drop",
    name: "Alien Swarm: Reactive Drop",
    type: "community",
    status: "active",
    visibility: "public",
    isDefault: true,
    sortOrder: 10,
    branding: {},
    links: {},
    installMethod: "external_installer",
    installConfig: { external_installer: { url: "steam://install/563560" } },
    features: [],
    tags: [],
  } as unknown as Edition;

  it("lists the base game plus the one edition, without storing a row for it", () => {
    const listed = listedEditionsFromStored(alienSwarm, [reactiveDrop]);

    // Both are listed. Order follows the codebase convention that the
    // default edition leads, so Reactive Drop is first here.
    expect(listed.map((e) => e.slug).sort()).toEqual([
      "alien-swarm-reactive-drop",
      "official",
    ]);
    const base = listed.find((e) => e.slug === "official")!;
    expect(base).toBeDefined();
    // The base game is synthesized, never persisted — no extra edition to curate.
    expect(base.virtual).toBe(true);
    // And it carries the game's own store hand-off, not its marketing site.
    expect(base.installMethod).toBe("external_installer");
    expect(base.installConfig.external_installer?.url).toBe("steam://install/630");
  });

  it("leaves the stored default alone", () => {
    const listed = listedEditionsFromStored(alienSwarm, [reactiveDrop]);
    const defaults = listed.filter((e) => e.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].slug).toBe("alien-swarm-reactive-drop");
  });

  it("does not invent a base game for a game that only plays via its edition", () => {
    // No recipe, not browser playable, no steam app: nothing to install alone.
    const modOnly = { slug: "some-mod-only-game", title: "X", platforms: [] } as unknown as Game;
    const listed = listedEditionsFromStored(modOnly, [
      { ...reactiveDrop, gameSlug: "some-mod-only-game", slug: "community" } as Edition,
    ]);
    expect(listed.map((e) => e.slug)).toEqual(["community"]);
  });

  it("does not duplicate a base game that is already stored as an official edition", () => {
    const official = {
      ...reactiveDrop,
      slug: "official",
      type: "official",
      name: "Alien Swarm",
    } as Edition;
    const listed = listedEditionsFromStored(alienSwarm, [official, reactiveDrop]);
    expect(listed.filter((e) => e.slug === "official")).toHaveLength(1);
  });
});
