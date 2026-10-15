import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), logs: vi.fn() }));
vi.mock("@/lib/friendsAuth", () => ({ getFriendsUserId: mocks.user }));
vi.mock("@/lib/dedicatedHosting/logs", () => ({ getServerLogs: mocks.logs }));
import { GET } from "./route";
const request = new Request("https://playbound.club/api/hosting/servers/id/logs");
const ctx = { params: Promise.resolve({ id: "server-id" }) };
beforeEach(() => { vi.resetAllMocks(); });
it("denies signed-out reads without contacting the host", async () => {
  mocks.user.mockResolvedValue(null);
  const response = await GET(request, ctx);
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.logs).not.toHaveBeenCalled();
});
it("passes the authenticated identity and preserves authorization failures", async () => {
  mocks.user.mockResolvedValue("user-id");
  mocks.logs.mockResolvedValue({ error: "Denied", status: 403 });
  expect((await GET(request, ctx)).status).toBe(403);
  expect(mocks.logs).toHaveBeenCalledWith("user-id", "server-id");
});
it("serves private uncached output only", async () => {
  mocks.user.mockResolvedValue("owner");
  mocks.logs.mockResolvedValue({ snapshot: { available: true, lines: ["Ready"], truncated: false }, status: 200 });
  const response = await GET(request, ctx);
  expect(await response.json()).toEqual({ available: true, lines: ["Ready"], truncated: false });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
