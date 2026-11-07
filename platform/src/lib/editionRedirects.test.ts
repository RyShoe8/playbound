import { describe, expect, it } from "vitest";
import { currentEditionSlug, isBaseGameEditionRow, retiredEditionRedirect } from "./editionRedirects";
import { editionPayloadSchema } from "./editionPayload";

describe("retired edition redirects", () => {
  it("sends the old Daggerfall PlayBound edition to Daggerfall Unity", () => {
    expect(retiredEditionRedirect("daggerfall", "playbound-remastered")).toBe("/games/daggerfall/editions/daggerfall-unity");
  });

  it("sends the removed Quake Champions pack to the game page", () => {
    expect(retiredEditionRedirect("quake-champions", "qc-champions-pack")).toBe("/games/quake-champions");
  });

  it("leaves every other edition alone", () => {
    expect(retiredEditionRedirect("daggerfall", "classic-dos")).toBeNull();
  });
});

describe("edition install links", () => {
  const base = { gameSlug: "alien-swarm", slug: "reactive-drop", name: "Reactive Drop" };

  it("accepts storefront protocol links, which are not http(s)", () => {
    const parsed = editionPayloadSchema.safeParse({
      ...base,
      installMethod: "external_installer",
      installConfig: { external_installer: { url: "steam://install/563560" } },
    });
    expect(parsed.success).toBe(true);
  });

  it("still rejects a link with no scheme", () => {
    const parsed = editionPayloadSchema.safeParse({
      ...base,
      installMethod: "external_installer",
      installConfig: { external_installer: { url: "reactivedrop.com" } },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("renamed edition slugs", () => {
  it("resolves the old slug only for its own game", () => {
    expect(currentEditionSlug("team-fortress-2", "tf2-classic")).toBe("tf2-classified");
    expect(currentEditionSlug("team-fortress-2", "official")).toBe("official");
    expect(currentEditionSlug("other-game", "tf2-classic")).toBe("tf2-classic");
  });
});

describe("base game rows", () => {
  it("recognises a row standing for the base game, by slug or by type", () => {
    expect(isBaseGameEditionRow({ slug: "official", type: "community" })).toBe(true);
    expect(isBaseGameEditionRow({ slug: "steam-build", type: "official" })).toBe(true);
    expect(isBaseGameEditionRow({ slug: "ddnet", type: "community" })).toBe(false);
  });
  it("sends retired duplicates to their game page", () => {
    expect(retiredEditionRedirect("trigger-rally", "trigger-rally-portable")).toBe("/games/trigger-rally");
    expect(retiredEditionRedirect("quake-champions", "qc-steam")).toBe("/games/quake-champions");
  });
});
