import crypto from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), find: vi.fn(), update: vi.fn(), lock: vi.fn(), create: vi.fn(),
  list: vi.fn(), del: vi.fn(), head: vi.fn(), transfer: vi.fn(),
}));
vi.mock("@/lib/requireAdmin", () => ({ requireAdminSession: mocks.auth }));
vi.mock("@/lib/models/MixtapeUpload", () => ({ default: { findOne: mocks.find, updateOne: mocks.update, findOneAndUpdate: mocks.lock, create: mocks.create } }));
vi.mock("@vercel/blob", () => ({ list: mocks.list, del: mocks.del }));
vi.mock("@/lib/mirrors/r2Client", () => ({ r2HotcacheConfigured: () => true, checkR2ObjectExists: mocks.head, uploadStreamToR2: mocks.transfer }));
import { POST } from "../../app/api/admin/mixtape/upload/route";
const name = "01234567-abcd-abcd-abcd-0123456789ab.mp3";
const sha256 = crypto.createHash("sha256").update("abc").digest("hex");
const stagingUrl = "https://store.public.blob.vercel-storage.com/mixtape-staging/test.mp3";
const job = { name, userId: "admin", size: 3, sha256, contentType: "audio/mpeg", state: "staging" };
const request = (body: unknown) => new Request("https://playbound.club/api/admin/mixtape/upload", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllGlobals();
  process.env.BLOB_READ_WRITE_TOKEN = "test";
  mocks.auth.mockResolvedValue({ session: { user: { id: "admin" } } });
  mocks.find.mockResolvedValue({ ...job }); mocks.lock.mockResolvedValue(job);
  mocks.list.mockResolvedValue({ blobs: [{ pathname: `mixtape-staging/${name}`, size: 3, url: stagingUrl }] });
  mocks.head.mockResolvedValue({ exists: false }); mocks.transfer.mockResolvedValue({ success: true });
});
it("refuses unauthenticated uploads before touching storage", async () => {
  mocks.auth.mockResolvedValue({ error: new Response("Admin only", { status: 403 }) });
  expect((await POST(request({ action: "status", name }))).status).toBe(403);
  expect(mocks.find).not.toHaveBeenCalled();
});
it("copies the staged file straight to R2, never through the game mirror", async () => {
  mocks.head.mockResolvedValueOnce({ exists: false }).mockResolvedValueOnce({ exists: true, sizeBytes: 3 });
  const fetchMock = vi.fn().mockResolvedValue(new Response("abc")); vi.stubGlobal("fetch", fetchMock);
  const result = await (await POST(request({ action: "archive", name }))).json();
  expect(result.state).toBe("ready");
  expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([stagingUrl]);
  expect(mocks.transfer).toHaveBeenCalledWith(`mixtape/${name}`, expect.anything(), 3, "audio/mpeg");
  expect(mocks.del).toHaveBeenCalledWith(stagingUrl);
});
it("rejects a staged file whose checksum differs before writing to R2", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("abd")));
  const res = await POST(request({ action: "archive", name }));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/checksum/);
  expect(mocks.transfer).not.toHaveBeenCalled(); expect(mocks.del).not.toHaveBeenCalled();
});
it("retains staging when R2 verification fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("abc")));
  expect((await POST(request({ action: "status", name }))).status).toBe(400);
  expect(mocks.del).not.toHaveBeenCalled();
});
it("finishes an upload already in R2 without copying again", async () => {
  mocks.head.mockResolvedValue({ exists: true, sizeBytes: 3 });
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  expect((await (await POST(request({ action: "status", name }))).json()).state).toBe("ready");
  expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.del).toHaveBeenCalledWith(stagingUrl);
});
it("waits while another request holds the copy lease", async () => {
  mocks.lock.mockResolvedValue(null);
  expect((await (await POST(request({ action: "status", name }))).json()).state).toBe("promoting");
  expect(mocks.transfer).not.toHaveBeenCalled();
});
