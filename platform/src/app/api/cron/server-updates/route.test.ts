import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/telemetry/server/saveEvent", () => ({ saveEvent: mocks.save }));
import { POST } from "./route";
const id = "a508e5fc-e88f-47aa-8536-549613054818";
const failure = { id, key: "team-fortress-2", action: "update", status: "failed", message: "Steam access denied" };
const request = (body: unknown, authenticated = true) => new Request("https://playbound.club/api/cron/server-updates", {
  method: "POST", headers: authenticated ? { authorization: "Bearer fixture-secret" } : {}, body: JSON.stringify(body),
});
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("GAME_HOST_SECRET", "fixture-secret"); mocks.save.mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllEnvs());
it("requires the VPS credential before accepting reports", async () => {
  expect((await POST(request({ failures: [failure] }, false))).status).toBe(401); expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects unknown games, oversized batches and arbitrary actions", async () => {
  for (const failures of [[{ ...failure, key: "../private" }], Array(11).fill(failure), [{ ...failure, action: "delete" }]]) {
    expect((await POST(request({ failures }))).status).toBe(400);
  }
  expect(mocks.save).not.toHaveBeenCalled();
});
it("records telemetry using the update receipt and acknowledges only persisted failures", async () => {
  mocks.save.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Bugs unavailable"));
  const response = await POST(request({ failures: [failure, { ...failure, id: "b508e5fc-e88f-47aa-8536-549613054818" }] }));
  expect(await response.json()).toEqual({ acknowledged: [id] });
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ event: "community_server_update_failed", properties: expect.objectContaining({ installationUpdateJobId: id, gameSlug: "team-fortress-2", code: "UPDATE_FAILED" }) }));
});
