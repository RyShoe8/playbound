import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), friends: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/friendsAuth", () => ({ getFriendsUserId: mocks.auth }));
vi.mock("@/lib/db", () => ({ default: mocks.db }));
vi.mock("@/lib/models/PlayAvailability", () => ({ default: { updateOne: mocks.update } }));
vi.mock("@/lib/friends/availabilityService", () => ({ availabilityForFriends: mocks.friends }));
import { GET, PUT } from "./route";
import { emptyAvailability } from "@/lib/friends/availability";
beforeEach(() => vi.resetAllMocks());
it("rejects anonymous reads and writes before touching the database", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET(new Request("https://test/api/friends/availability"))).status).toBe(401);
  expect((await PUT(new Request("https://test/api/friends/availability", { method: "PUT" }))).status).toBe(401);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.friends).not.toHaveBeenCalled();
});
it("scopes writes to the authenticated user, ignoring a supplied user ID", async () => {
  mocks.auth.mockResolvedValue("owner");
  const response = await PUT(new Request("https://test/api/friends/availability", { method: "PUT", body: JSON.stringify({ ...emptyAvailability(), userId: "someone-else" }) }));
  expect(response.status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ userId: "owner" }, { $set: emptyAvailability() }, { upsert: true, runValidators: true });
});
it("rejects invalid data without a write", async () => {
  mocks.auth.mockResolvedValue("owner");
  expect((await PUT(new Request("https://test/api/friends/availability", { method: "PUT", body: "{}" }))).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("returns friends-only data with no shared cache", async () => {
  mocks.auth.mockResolvedValue("owner"); mocks.friends.mockResolvedValue({ availability: emptyAvailability(), friends: [] });
  const response = await GET(new Request("https://test/api/friends/availability"));
  expect(mocks.friends).toHaveBeenCalledWith("owner");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
