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

it("authorizes every upload phase, binds the actor and audits only committed files", async () => {
  for (const action of ["upload-begin", "upload-chunk", "upload-commit", "upload-cancel"]) {
    await manageFiles("owner", "server", { action, path: "save.dat", actor: "forged", uploadId: "session", offset: 0, bytes: 2 });
    expect(mock.auth).toHaveBeenLastCalledWith("owner", "server", "server:write_files");
    expect(mock.host).toHaveBeenLastCalledWith("server", expect.objectContaining({ actor: "owner", action, uploadId: "session" }));
  }
  expect(mock.activity).toHaveBeenCalledTimes(1);
  expect(mock.activity).toHaveBeenCalledWith("server", { id: "owner" }, "file_upload-commit", "save.dat");
});

it("blocks late chunks and commits after a server starts but allows cleanup", async () => {
  mock.auth.mockResolvedValue({ server: { gameSlug: "luanti", desiredState: "running", runtimeState: "running" } });
  for (const action of ["upload-begin", "upload-chunk", "upload-commit"]) {
    expect(await manageFiles("owner", "server", { action })).toMatchObject({ status: 409 });
  }
  expect(mock.host).not.toHaveBeenCalled();
  await manageFiles("owner", "server", { action: "upload-cancel", path: "save.dat", uploadId: "session" });
  expect(mock.host).toHaveBeenCalledTimes(1);
});
