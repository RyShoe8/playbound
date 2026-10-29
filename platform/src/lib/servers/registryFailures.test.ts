import { afterEach, expect, it, vi } from "vitest";
import { listServersForGame } from "./registry";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps hosted rooms visible and pauses a failing upstream for one minute", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
  const fetch = vi.fn().mockResolvedValue(new Response("Unavailable", { status: 500 }));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const hosted = [{ id: "playbound:1", name: "PlayBound", gameSlug: "supertuxkart", host: "127.0.0.1", port: 2759, players: 2, maxPlayers: 8, map: null, gameType: null, location: null, protected: false }];

  const first = await listServersForGame("supertuxkart", hosted);
  expect(first.servers).toMatchObject(hosted);
  expect(first.error).toContain("500");
  expect(fetch).toHaveBeenCalledOnce();

  const duringCooldown = await listServersForGame("supertuxkart", hosted);
  expect(duringCooldown.servers).toMatchObject(hosted);
  expect(duringCooldown.error).toBe(first.error);
  expect(fetch).toHaveBeenCalledOnce();

  now.mockReturnValue(61_001);
  await listServersForGame("supertuxkart", hosted);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("shares a concurrent upstream poll while keeping each caller's hosted rooms", async () => {
  let release!: (value: Response) => void;
  const fetch = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { release = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const left = [{ id: "left", name: "Left", gameSlug: "supertuxkart", host: "127.0.0.1", port: 2759, players: 1, maxPlayers: 8, map: null, gameType: null, location: null, protected: false }];
  const right = [{ ...left[0], id: "right", name: "Right" }];
  const a = listServersForGame("supertuxkart", left);
  const b = listServersForGame("supertuxkart", right);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  release(new Response("<servers/>", { status: 200 }));
  expect((await a).servers).toMatchObject(left);
  expect((await b).servers).toMatchObject(right);
});
