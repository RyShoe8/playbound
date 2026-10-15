import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), tier: vi.fn() }));
vi.mock("@/lib/models/DedicatedSubscription", () => ({ default: { findById: mocks.find } }));
vi.mock("./tier", () => ({ getTier: mocks.tier }));
import { customerRuntimeAllocation } from "./runtimeAllocation";

const server = { dedicatedSubscriptionId: "subscription", allocatedSlots: 9 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockReturnValue({ select: () => ({ lean: async () => ({ tier: "basic" }) }) });
  mocks.tier.mockResolvedValue({ resourceClass: { slotsPerUnit: 4, cpuPerUnit: 0.5, memoryMbPerUnit: 1024, storageGbPerUnit: 5 } });
});
it("rounds slot blocks using the inventory envelope for every scoped engine", async () => {
  for (const game of ["teeworlds", "bzflag", "hedgewars", "openttd", "luanti"]) {
    expect(await customerRuntimeAllocation(server, game)).toEqual({ cpuMillis: 1500, memoryMiB: 3072 });
  }
});
it("does not claim enforcement or fetch a subscription for other engines", async () => {
  expect(await customerRuntimeAllocation(server, "openra")).toBeUndefined();
  expect(mocks.find).not.toHaveBeenCalled();
});
it("fails closed for missing subscriptions, invalid sizing or unsupported allocations", async () => {
  mocks.find.mockReturnValueOnce({ select: () => ({ lean: async () => null }) });
  await expect(customerRuntimeAllocation(server, "openttd")).rejects.toThrow(/Subscription/);
  for (const slots of [0, -1, NaN, Infinity, 1.2, 100]) {
    await expect(customerRuntimeAllocation({ ...server, allocatedSlots: slots }, "openttd")).rejects.toThrow(/allocation|limits/);
  }
  mocks.tier.mockResolvedValue({ resourceClass: { slotsPerUnit: 0 } });
  await expect(customerRuntimeAllocation(server, "openttd")).rejects.toThrow(/allocation/);
});
