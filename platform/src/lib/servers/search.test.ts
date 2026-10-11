import { expect, it } from "vitest";
import { matchesServerSearch } from "./search";
it("finds a community server by its visible game title and canonical slug", () => {
  const server = { name: "PlayBound.Club Community Server", gameTitle: "Hedgewars", gameSlug: "hedgewars", players: 0, maxPlayers: 16 };
  expect(matchesServerSearch(server, " Hedgewars ")).toBe(true);
  expect(matchesServerSearch(server, "OpenRA")).toBe(false);
});
it("retains map, edition, server-name and capacity search", () => {
  const server = { name: "Friends", map: "Arena", gameType: "ca", players: 2, maxPlayers: 16 };
  for (const term of ["friends", "arena", "Combined Arms", "2/16", ""]) expect(matchesServerSearch(server, term, "Combined Arms")).toBe(true);
});
