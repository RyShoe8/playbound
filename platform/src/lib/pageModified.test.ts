import { describe, expect, it } from "vitest";
import { gamePageModified, latestModified } from "@/lib/pageModified";

describe("gamePageModified", () => {
  it("takes the newest of game, admin edit, editions and mods", () => {
    expect(
      gamePageModified(
        { updatedAt: "2026-01-01T00:00:00Z", adminUpdatedAt: "2026-02-01T00:00:00Z" },
        [{ updatedAt: "2026-03-01T00:00:00Z" }],
        [{ updatedAt: "2026-04-01T00:00:00Z" }, {}]
      )
    ).toBe("2026-04-01T00:00:00.000Z");
  });

  it("moves when only an edition changes", () => {
    const game = { updatedAt: "2026-01-01T00:00:00Z" };
    expect(gamePageModified(game, [{ updatedAt: "2026-06-01T00:00:00Z" }])).toBe("2026-06-01T00:00:00.000Z");
  });

  it("is null rather than invented when nothing is dated", () => {
    expect(gamePageModified({})).toBeNull();
    expect(latestModified("garbage", null)).toBeNull();
  });
});
