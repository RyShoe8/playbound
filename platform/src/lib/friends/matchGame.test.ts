import { expect, it } from "vitest";
import { selectMatchGame, type MatchPlayer } from "./matchGame";
import { defaultPlayPreferences } from "./playPreferences";

const games = [{ slug: "openra", title: "OpenRA", genres: ["Strategy"], free: true }];
const installed: MatchPlayer = { preferences: defaultPlayPreferences, installs: [{ gameSlug: "openra", installed: true, editionSlug: "ra" }] };
it("keeps shared installed editions, not just matching base-game names", () => {
  expect(selectMatchGame(games, installed, installed)?.editionSlug).toBe("ra");
  expect(selectMatchGame(games, installed, { ...installed, installs: [{ gameSlug: "openra", installed: true, editionSlug: "td" }] })).toBeNull();
});
it("applies both people's genre and game preferences", () => {
  expect(selectMatchGame(games, installed, { ...installed, preferences: { ...defaultPlayPreferences, mode: "genres", genres: ["Racing"] } })).toBeNull();
  expect(selectMatchGame(games, installed, { ...installed, preferences: { ...defaultPlayPreferences, mode: "games", games: ["openra"] } })?.game.slug).toBe("openra");
});
it("only suggests free downloads when both people consent", () => {
  const download = { installs: [], preferences: { ...defaultPlayPreferences, downloads: true } };
  expect(selectMatchGame(games, download, download)?.game.slug).toBe("openra");
  expect(selectMatchGame(games, download, { ...download, preferences: defaultPlayPreferences })).toBeNull();
  expect(selectMatchGame([{ ...games[0], free: false }], download, download)).toBeNull();
});
it("does not claim a phone install is the same as a desktop install", () => {
  expect(selectMatchGame(games, installed, { ...installed, installs: [{ ...installed.installs[0], platform: "android" }] })).toBeNull();
});
it("does not propose a single-player edition when a particular multiplayer edition is required", () => {
  expect(selectMatchGame([{ ...games[0], requiredEditionSlug: "coop" }], installed, installed)).toBeNull();
});
