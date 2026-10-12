import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), games: vi.fn(), developers: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/developerAccess", () => ({ listManageableGames: mocks.games, listManageableDevelopers: mocks.developers }));
import DeveloperDashboard from "./page";
import DeveloperLayout from "./layout";
import { DeveloperPromo } from "@/components/developer/DeveloperPromo";
beforeEach(() => vi.resetAllMocks());
it("shows visitors the promo without looking up private managed games", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await DeveloperDashboard()).type).toBe(DeveloperPromo);
  expect(mocks.games).not.toHaveBeenCalled();
  expect(mocks.developers).not.toHaveBeenCalled();
  expect((await DeveloperLayout({ children: "promo" })).props.children).toBe("promo");
});
it("preserves the signed-in dashboard", async () => {
  mocks.session.mockResolvedValue({ user: { id: "creator" } });
  mocks.games.mockResolvedValue([]);
  mocks.developers.mockResolvedValue([]);
  expect((await DeveloperDashboard()).type).toBe("div");
  expect(mocks.games).toHaveBeenCalledWith("creator");
});
