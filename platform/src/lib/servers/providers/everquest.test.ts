import { afterEach, expect, it, vi } from "vitest";
import { fetchEverQuestServers } from "./everquest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("preserves official worlds and pauses only the blocked community source", async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) =>
    url.includes("eqemulator.org")
      ? new Response("Forbidden", { status: 403 })
      : Response.json({ game_server_status_list: [{ name: "Bristlebane", region_code: "live", last_reported_state: "low" }] })
  );
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "warn").mockImplementation(() => {});

  expect(await fetchEverQuestServers()).toMatchObject([{ name: "Bristlebane", players: 15 }]);
  expect(await fetchEverQuestServers()).toMatchObject([{ name: "Bristlebane", players: 15 }]);
  expect(fetch.mock.calls.filter(([url]) => String(url).includes("eqemulator.org"))).toHaveLength(1);
});
