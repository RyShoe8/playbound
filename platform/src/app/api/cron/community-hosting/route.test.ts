import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ready: vi.fn(), community: vi.fn(), dedicated: vi.fn(), save: vi.fn(), authorized: vi.fn() }));
vi.mock("@/lib/db", async (original) => ({
  ...await original<typeof import("@/lib/db")>(), ensureHostingDatabaseReady: mocks.ready,
}));
vi.mock("@/lib/communityHosting/reconcile", () => ({ reconcileCommunityHosting: mocks.community }));
vi.mock("@/lib/dedicatedHosting/reconcile", () => ({ reconcileDedicatedServers: mocks.dedicated }));
vi.mock("@/lib/telemetry/server/saveEvent", () => ({ saveEvent: mocks.save }));
vi.mock("@/lib/cronAuth", () => ({ cronAuthorized: mocks.authorized }));
import { GET, POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorized.mockReturnValue(true);
  mocks.ready.mockResolvedValue(undefined);
  mocks.dedicated.mockResolvedValue({ action: "idle" });
  mocks.community.mockResolvedValue({ action: "disabled" });
});
const request = () => new Request("https://playbound.club/api/cron/community-hosting", { method: "POST" });

describe("hosting scheduler database failures", () => {
  it("checks readiness before serial paid and community passes", async () => {
    const order: string[] = [];
    mocks.ready.mockImplementation(async () => { order.push("ready"); });
    mocks.dedicated.mockImplementation(async () => { order.push("dedicated"); return { action: "idle" }; });
    mocks.community.mockImplementation(async () => { order.push("community"); return { action: "disabled" }; });
    expect((await POST(request())).status).toBe(200);
    expect(order).toEqual(["ready", "dedicated", "community"]);
  });
  it("does not dispatch work or write telemetry on failed readiness", async () => {
    mocks.ready.mockRejectedValue(new Error("Server selection timed out after 5000 ms"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "DATABASE_UNAVAILABLE", ok: false });
    expect(mocks.dedicated).not.toHaveBeenCalled();
    expect(mocks.community).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("never replays a pass or starts another after a checkout failure", async () => {
    mocks.dedicated.mockRejectedValue(new Error("Timed out while checking out a connection from connection pool"));
    expect((await GET(request())).status).toBe(503);
    expect(mocks.dedicated).toHaveBeenCalledTimes(1);
    expect(mocks.community).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("still runs community work after an unrelated dedicated failure", async () => {
    mocks.dedicated.mockRejectedValue(new Error("Invalid recipe"));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.community).toHaveBeenCalledTimes(1);
  });
  it("keeps unexpected errors visible in telemetry", async () => {
    mocks.community.mockRejectedValue(new Error("Invalid reservation"));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.community).toHaveBeenCalledTimes(1);
  });
  it("does no database work for unauthorized requests", async () => {
    mocks.authorized.mockReturnValue(false);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.ready).not.toHaveBeenCalled();
  });
});
