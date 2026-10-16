import { beforeEach, expect, it, vi } from "vitest";
const list = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gameHost/client", () => ({ listManagedHostRooms: list, requestManagedHostRoom: vi.fn(), sendRoomCommand: vi.fn(), stopManagedHostRoom: vi.fn() }));
import { createManagedVpsAdapter } from "./managedVps";
import { requestManagedHostRoom } from "@/lib/gameHost/client";
const adapter = () => createManagedVpsAdapter({ id: "customer", gameSlug: "xonotic", recipeSlug: "xonotic", editionSlug: null, mod: null, name: "Customer server", settings: {} });
beforeEach(() => vi.resetAllMocks());
it("selects the edition's native settings without changing catalog identity", async () => {
  const managed = createManagedVpsAdapter({ id: "customer", gameSlug: "team-fortress-2", recipeSlug: "open-fortress", editionSlug: "open-fortress", mod: null, name: "Open Fortress", settings: {} });
  expect(await managed.getSettings()).toMatchObject({ gameSlug: "open-fortress", values: { map: "dm_2fort", maxPlayers: 16 } });
  expect((await managed.getSettings()).definitions.find(def => def.key === "map")).toMatchObject({ options: expect.arrayContaining([{ value: "dm_backfort", label: "Backfort" }]) });
});
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
it("resolves customer allocation only when starting and sends it outside game settings", async () => {
  const allocation = vi.fn(async () => ({ cpuMillis: 750, memoryMiB: 1536 }));
  const managed = createManagedVpsAdapter({ id: "customer", gameSlug: "teeworlds", recipeSlug: "teeworlds", editionSlug: null, mod: null, name: "Customer server", customerOwned: true, settings: {}, resourceLimits: allocation });
  list.mockResolvedValue({ ok: true, rooms: [], jobs: {} });
  vi.mocked(requestManagedHostRoom).mockResolvedValue({ status: "pending" });
  await managed.getStatus();
  expect(allocation).not.toHaveBeenCalled();
  await managed.start();
  expect(requestManagedHostRoom).toHaveBeenCalledWith(expect.objectContaining({ resourceLimits: { cpuMillis: 750, memoryMiB: 1536 }, settings: {} }));
});
it("rejects unavailable allocations without dispatching a start", async () => {
  const managed = createManagedVpsAdapter({ id: "customer", gameSlug: "teeworlds", recipeSlug: "teeworlds", editionSlug: null, mod: null, name: "Customer server", customerOwned: true, settings: {}, resourceLimits: async () => { throw new Error("Unsupported allocation"); } });
  expect(await managed.start()).toMatchObject({ status: "failed", error: "Unsupported allocation" });
  expect(requestManagedHostRoom).not.toHaveBeenCalled();
});
