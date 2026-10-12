import { afterEach, expect, it, vi } from "vitest";
import { listManagedHostRooms } from "./client";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it.each([{}, { rooms: [] }, { rooms: null, jobs: {} }, { rooms: [], jobs: [] }])("rejects incomplete snapshots: %j", async (body) => {
  vi.stubEnv("GAME_HOST_URL", "http://agent.test");
  vi.stubEnv("GAME_HOST_SECRET", "test-only");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
  expect(await listManagedHostRooms()).toEqual({ ok: false, error: "Game host returned an incomplete managed-runtime snapshot" });
});
it("accepts an empty fleet and preserves stop evidence", async () => {
  vi.stubEnv("GAME_HOST_URL", "http://agent.test");
  vi.stubEnv("GAME_HOST_SECRET", "test-only");
  const body = { rooms: [], jobs: { test: { status: "stopped", at: 1 } } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
  expect(await listManagedHostRooms()).toEqual({ ok: true, ...body });
});
