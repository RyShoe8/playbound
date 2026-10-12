import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), subscription: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/dedicatedHosting/servers", () => ({ currentSubscription: mocks.subscription }));
vi.mock("@/lib/dedicatedHosting/entitlement", () => ({ RUNNABLE_STATUSES: ["active", "past_due"] }));
vi.mock("@/components/hosting/HostingDashboard", () => ({ HostingDashboard: () => null }));
vi.mock("../page", () => ({ default: () => null }));
import HostingServersPage from "./page";
import HostingPage from "../page";
beforeEach(() => { vi.resetAllMocks(); });
it("shows hosting plans signed out without querying a subscription", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await HostingServersPage()).type).toBe(HostingPage);
  expect(mocks.subscription).not.toHaveBeenCalled();
});
it.each([null, { status: "expired" }, { status: "canceled" }])("shows plans without an active subscription: %j", async (subscription) => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.subscription.mockResolvedValue(subscription);
  expect((await HostingServersPage()).type).toBe(HostingPage);
});
it.each(["active", "past_due"])("keeps the dashboard available to %s subscribers", async (status) => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.subscription.mockResolvedValue({ status });
  expect((await HostingServersPage()).type).toBe("div");
});
