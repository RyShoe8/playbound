import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), find: vi.fn(), update: vi.fn(), lock: vi.fn(), create: vi.fn(),
  list: vi.fn(), del: vi.fn(), archive: vi.fn(), status: vi.fn(), head: vi.fn(), transfer: vi.fn(),
}));
vi.mock("@/lib/requireAdmin", () => ({ requireAdminSession: mocks.auth }));
vi.mock("@/lib/models/MixtapeUpload", () => ({ default: { findOne: mocks.find, updateOne: mocks.update, findOneAndUpdate: mocks.lock, create: mocks.create } }));
vi.mock("@vercel/blob", () => ({ list: mocks.list, del: mocks.del }));
vi.mock("@/lib/gameHost/client", () => ({ archiveArtifactOnHost: mocks.archive, archivedArtifactStatusOnHost: mocks.status }));
vi.mock("@/lib/mirrors/cacheManager", () => ({ getMirrorSettings: async () => ({ vpsMirrorBaseUrl: "https://mirror.playbound.club" }) }));
vi.mock("@/lib/mirrors/r2Client", () => ({ r2HotcacheConfigured: () => true, checkR2ObjectExists: mocks.head, uploadStreamToR2: mocks.transfer }));
import { POST } from "../../app/api/admin/mixtape/upload/route";
const name = "01234567-abcd-abcd-abcd-0123456789ab.mp3";
const job = { name, userId: "admin", size: 3, sha256: "a".repeat(64), contentType: "audio/mpeg", sourceUrl: "https://store.public.blob.vercel-storage.com/mixtape-staging/test.mp3", state: "archiving" };
const request = (body: unknown) => new Request("https://playbound.club/api/admin/mixtape/upload", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllGlobals();
  process.env.BLOB_READ_WRITE_TOKEN = "test"; process.env.GAME_HOST_URL = "https://host.test"; process.env.GAME_HOST_SECRET = "test";
  mocks.auth.mockResolvedValue({ session: { user: { id: "admin" } } });
  mocks.find.mockResolvedValue({ ...job }); mocks.lock.mockResolvedValue(job);
  mocks.head.mockResolvedValue({ exists: false }); mocks.transfer.mockResolvedValue({ success: true });
});
it("refuses unauthenticated uploads before touching storage", async () => {
  mocks.auth.mockResolvedValue({ error: new Response("Admin only", { status: 403 }) });
  expect((await POST(request({ action: "status", name }))).status).toBe(403);
  expect(mocks.find).not.toHaveBeenCalled();
});
it("waits for VPS checksum verification before R2 promotion", async () => {
  mocks.status.mockResolvedValue({ status: "uploading", bytesReceived: 1 });
  expect((await (await POST(request({ action: "status", name }))).json()).state).toBe("archiving");
  expect(mocks.transfer).not.toHaveBeenCalled(); expect(mocks.del).not.toHaveBeenCalled();
});
it("promotes from the VPS and removes staging only after R2 verification", async () => {
  mocks.status.mockResolvedValue({ status: "verified", sizeBytes: 3 });
  mocks.head.mockResolvedValueOnce({ exists: false }).mockResolvedValueOnce({ exists: true, sizeBytes: 3 });
  const fetchMock = vi.fn().mockResolvedValue(new Response("abc", { headers: { "content-length": "3" } })); vi.stubGlobal("fetch", fetchMock);
  const result = await (await POST(request({ action: "status", name }))).json();
  expect(result.state).toBe("ready"); expect(fetchMock.mock.calls[0][0]).toBe(`https://mirror.playbound.club/mixtape/${name}`);
  expect(mocks.transfer).toHaveBeenCalled(); expect(mocks.del).toHaveBeenCalledWith(job.sourceUrl);
});
it("retains staging when R2 verification fails", async () => {
  mocks.status.mockResolvedValue({ status: "verified", sizeBytes: 3 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("abc", { headers: { "content-length": "3" } })));
  expect((await POST(request({ action: "status", name }))).status).toBe(400);
  expect(mocks.del).not.toHaveBeenCalled();
});
