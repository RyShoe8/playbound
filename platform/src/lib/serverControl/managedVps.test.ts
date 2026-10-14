import { beforeEach, expect, it, vi } from "vitest";
const list = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gameHost/client", () => ({ listManagedHostRooms: list, requestManagedHostRoom: vi.fn(), sendRoomCommand: vi.fn(), stopManagedHostRoom: vi.fn() }));
import { createManagedVpsAdapter } from "./managedVps";
const adapter = () => createManagedVpsAdapter({ id: "customer", gameSlug: "xonotic", recipeSlug: "xonotic", editionSlug: null, mod: null, name: "Customer server", settings: {} });
beforeEach(() => vi.resetAllMocks());
it("preserves pending status and exposes only the matched runtime's safe metrics", async () => {
  list.mockResolvedValue({ ok: true, rooms: [
    { communityServerId: "other", resources: { available: true, cpuCores: 5 } },
    { communityServerId: "customer", status: "pending", host: "localhost", port: 1, createdAt: 1000, processStartedAt: 2000, pid: 123, settings: { rconPassword: "secret" }, resources: { available: true, cpuCores: 0.25, rssBytes: 512, collectedAt: "2026-10-14T01:00:00Z" } },
  ], jobs: {} });
  const status = await adapter().getStatus();
  expect(status.status).toBe("pending");
  expect(status.startedAt).toEqual(new Date(2000));
  expect(status.resources).toEqual({ cpuCores: 0.25, rssBytes: 512, collectedAt: "2026-10-14T01:00:00Z" });
  expect(JSON.stringify(status)).not.toMatch(/secret|rconPassword|pid/);
});
it("keeps unreachable state unknown rather than stopped with zero usage", async () => {
  list.mockResolvedValue({ ok: false, error: "Host unavailable" });
  expect(await adapter().getStatus()).toMatchObject({ status: "unknown", error: "Host unavailable" });
  expect((await adapter().getStatus()).resources).toBeUndefined();
});
