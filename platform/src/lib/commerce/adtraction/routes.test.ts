import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/requireAdmin", () => ({ requireAdminSession: mocks.auth }));
vi.mock("./sync", () => ({ syncAdtraction: mocks.sync }));
import { POST } from "@/app/api/admin/ecommerce/adtraction/sync/route";
import { GET } from "@/app/api/cron/adtraction/route";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", "test-cron-secret"); });
afterEach(() => vi.unstubAllEnvs());

it("requires full admin for manual sync and the cron secret for scheduled sync", async () => {
  mocks.auth.mockResolvedValue({ error: new Response(null, { status: 403 }) });
  expect((await POST()).status).toBe(403);
  expect((await GET(new Request("https://test/api/cron/adtraction"))).status).toBe(401);
  expect(mocks.sync).not.toHaveBeenCalled();
});
it("allows authorized syncs and returns a disabled status before token setup", async () => {
  mocks.auth.mockResolvedValue({ error: null });
  mocks.sync.mockResolvedValue({ status: "disabled", requests: 0, transactions: 0 });
  expect((await POST()).status).toBe(200);
  expect((await GET(new Request("https://test/api/cron/adtraction", { headers: { Authorization: "Bearer test-cron-secret" } }))).status).toBe(200);
  expect(mocks.sync).toHaveBeenCalledTimes(2);
});
it("does not expose raw failure details through the admin response", async () => {
  mocks.auth.mockResolvedValue({ error: null });
  mocks.sync.mockRejectedValue(new Error("secret upstream content"));
  const response = await POST();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
