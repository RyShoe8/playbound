import { describe, expect, it } from "vitest";
import { rankedHostingGames } from "./publicLineup";

describe("hosting plan lineup", () => {
  it("ranks only selected tier games by play popularity and uses DB titles", () => {
    expect(rankedHostingGames(
      [
        { gameSlug: "openra", title: "Seed title", editions: ["combined-arms"] },
        { gameSlug: "openarena", title: "OpenArena", editions: [] },
      ],
      [{ gameSlug: "openra", title: "OpenRA", editions: [] }],
      ["some-other-game", "openarena", "openra"],
    )).toEqual([
      { gameSlug: "openarena", title: "OpenArena", editions: [] },
      { gameSlug: "openra", title: "OpenRA", editions: ["combined-arms"] },
    ]);
  });
});
