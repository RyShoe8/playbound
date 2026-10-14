import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ auth: vi.fn(), host: vi.fn(), activity: vi.fn() }));
vi.mock("./access", () => ({ authorizeServer: mock.auth, recordActivity: mock.activity }));
vi.mock("@/lib/gameHost/client", () => ({ filesOnHost: mock.host }));
vi.mock("@/lib/models/CommunityServerProfile", () => ({ default: { findOne: () => ({ select: () => ({ lean: async () => ({ recipeSlug: "luanti" }) }) }) } }));
import { manageFiles } from "./files";
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({ server: { profileKey: "luanti:base", gameSlug: "luanti", desiredState: "stopped", runtimeState: "stopped", slotsHeld: false } });
  mock.host.mockResolvedValue({ ok: true, data: { saved: true } });
});
it("requires file-specific permission before reaching the host", async () => {
  mock.auth.mockResolvedValue({ error: "Forbidden", status: 403 });
  expect(await manageFiles("moderator", "server", { action: "read", path: "world.json" })).toMatchObject({ status: 403 });
  expect(mock.host).not.toHaveBeenCalled();
  expect(mock.auth).toHaveBeenCalledWith("moderator", "server", "server:read_files");
});
it("rejects writes to running or pending servers", async () => {
  mock.auth.mockResolvedValue({ server: { desiredState: "running", runtimeState: "pending" } });
  expect(await manageFiles("owner", "server", { action: "write", path: "world.json" })).toMatchObject({ status: 409 });
  expect(mock.host).not.toHaveBeenCalled();
});
it("selects the recipe server-side and records mutations without file content", async () => {
  await manageFiles("owner", "server", { action: "write", gameSlug: "other-game", path: "world.json", contentBase64: "e30=", expectedEtag: "old" });
  expect(mock.host).toHaveBeenCalledWith("server", expect.objectContaining({ gameSlug: "luanti" }));
  expect(mock.activity).toHaveBeenCalledWith("server", { id: "owner" }, "file_write", "world.json");
});
