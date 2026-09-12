import { describe, expect, it } from "vitest";
import { mergeStoredAndSeedEditions, parseSeedEditionId } from "./editions";

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
