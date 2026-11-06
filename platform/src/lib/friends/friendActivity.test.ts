import { describe, expect, it } from "vitest";
import { activityGameSlugs, friendActivity } from "./friendActivity";

const titles = new Map([["openra", "OpenRA"], ["xonotic", "Xonotic"]]);

describe("friendActivity", () => {
  it("names the game only while actually playing it, not while viewing its page", () => {
    expect(friendActivity({ status: "playing", currentGameId: "openra" }, null, titles).playing).toEqual({ slug: "openra", title: "OpenRA" });
    expect(friendActivity({ status: "viewing_game", currentGameId: "openra" }, null, titles).playing).toBeNull();
    expect(friendActivity({ status: "playing", currentGameId: "not-listed" }, null, titles).playing).toBeNull();
  });

  it("treats 'any game' as no stated preference", () => {
    expect(friendActivity(null, { mode: "any", downloads: true }, titles).openTo).toBeNull();
    expect(friendActivity(null, undefined, titles).openTo).toBeNull();
  });

  it("lists chosen games with links, dropping any no longer in the catalog", () => {
    const { openTo } = friendActivity(null, { mode: "games", games: ["openra", "gone", "xonotic"], downloads: true }, titles);
    expect(openTo).toEqual({ games: [{ slug: "openra", title: "OpenRA" }, { slug: "xonotic", title: "Xonotic" }], genres: [], moreCount: 0, downloads: true });
  });

  it("lists genres and counts what it does not show", () => {
    const { openTo } = friendActivity(null, { mode: "genres", genres: ["A", "B", "C", "D", "E", "F", "G"] }, titles);
    expect(openTo?.genres).toHaveLength(5);
    expect(openTo?.moreCount).toBe(2);
  });

  it("only asks for titles it will use", () => {
    expect(activityGameSlugs({ status: "viewing_game", currentGameId: "openra" }, { mode: "genres" })).toEqual([]);
    expect(activityGameSlugs({ status: "playing", currentGameId: "openra" }, { mode: "games", games: ["xonotic"] })).toEqual(["openra", "xonotic"]);
  });
});
