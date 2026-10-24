import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connect: vi.fn(), find: vi.fn(), previous: vi.fn(), create: vi.fn(), index: vi.fn(), tag: vi.fn(), path: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: mocks.connect }));
vi.mock("@/lib/models/CatalogGame", () => ({ default: { find: mocks.find } }));
vi.mock("@/lib/models/BlogPost", () => ({ default: { findOne: mocks.previous, create: mocks.create, collection: { createIndex: mocks.index } } }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }));
import { GET, POST } from "./route";
import { publicationIdentity, verifyRoundupRequest } from "@/lib/nucleasRoundup";
const secret = "test-secret";
const input = { idempotencyKey: "release-1", title: "Release", summary: "Summary", bodyMarkdown: "# Games", coverageStart: "2026-10-01T00:00:00Z", coverageEnd: "2026-10-02T00:00:00Z", coveredIds: ["0123456789abcdef01234567"] };
function request(method = "POST", body = JSON.stringify(input), query = "", timestamp = String(Math.floor(Date.now() / 1000))) {
  const path = `/api/integrations/nucleas/roundup${query}`;
  return new Request(`https://playbound.club${path}`, { method, ...(method === "GET" ? {} : { body }), headers: { "x-nucleas-timestamp": timestamp, "x-nucleas-signature": createHmac("sha256", secret).update(`${timestamp}.${method}.${path}.${body}`).digest("hex") } });
}
function existing() { const identity = publicationIdentity(input); return { ...identity.normalized, _id: "post1", published: true, slug: identity.slug, sourcePayloadHash: identity.hash, publishedAt: new Date() }; }
beforeEach(() => { vi.resetAllMocks(); process.env.NUCLEAS_ROUNDUP_SECRET = secret; });
describe("roundup integration", () => {
  it("uses a readable title and coverage date with a short stable key suffix", () => {
    const identity = publicationIdentity({ ...input, title: "New Games & Platform Updates!" });
    expect(identity.slug).toMatch(/^new-games-platform-updates-2026-10-02-[a-f0-9]{12}$/);
    expect(publicationIdentity({ ...input, title: "Changed" }).slug.slice(-12)).toBe(identity.slug.slice(-12));
    expect(publicationIdentity({ ...input, title: "🎮" }).slug).toMatch(/^roundup-2026-10-02-/);
    expect(identity.sourceKey).toBe("nucleas:roundup:release-1");
  });
  it("fails closed without config or valid auth before DB access", async () => {
    delete process.env.NUCLEAS_ROUNDUP_SECRET;
    expect((await POST(request())).status).toBe(503);
    process.env.NUCLEAS_ROUNDUP_SECRET = secret;
    expect((await POST(new Request("https://playbound.club/api/integrations/nucleas/roundup", { method: "POST" }))).status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("binds signature to body, method, query and timestamp", () => {
    expect(verifyRoundupRequest(request(), JSON.stringify(input), secret)).toBe(true);
    expect(verifyRoundupRequest(request(), "tampered", secret)).toBe(false);
    expect(verifyRoundupRequest(request("POST", "", "", "1"), "", secret)).toBe(false);
    expect(verifyRoundupRequest(request("POST", "", "", String(Math.floor(Date.now()/1000)+301)), "", secret)).toBe(false);
    const req = request(); req.headers.set("x-nucleas-signature", "aa");
    expect(verifyRoundupRequest(req, JSON.stringify(input), secret)).toBe(false);
    const original = request("GET", "", "?since=x");
    expect(verifyRoundupRequest(new Request(original.url + "y", { headers: original.headers }), "", secret)).toBe(false);
    expect(verifyRoundupRequest(new Request(original.url, { method: "POST", headers: original.headers }), "", secret)).toBe(false);
  });
  it("publishes once then returns existing URL on retry", async () => {
    mocks.previous.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mocks.create.mockResolvedValue(existing());
    const first = await POST(request());
    expect(first.status).toBe(201);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ published: true, coveredIds: input.coveredIds, sourceKey: "nucleas:roundup:release-1" });
    mocks.previous.mockReturnValue({ lean: vi.fn().mockResolvedValue(existing()) });
    const retry = await POST(request());
    expect(retry.status).toBe(200);
    const firstReceipt = await first.json(); const retryReceipt = await retry.json();
    expect(firstReceipt).toMatchObject({ published: true, idempotencyKey: input.idempotencyKey, created: true, url: firstReceipt.post.url });
    expect(retryReceipt).toMatchObject({ published: true, idempotencyKey: input.idempotencyKey, created: false, url: firstReceipt.url });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.index).toHaveBeenCalled();
    expect(mocks.path.mock.calls.filter(([path]) => path === "/blog")).toHaveLength(2);
    expect(mocks.tag).toHaveBeenCalledWith("blog", { expire: 0 });
  });
  it("handles concurrent unique-key losers and rejects changed payloads", async () => {
    mocks.previous.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) }).mockReturnValue({ lean: vi.fn().mockResolvedValue(existing()) });
    mocks.create.mockRejectedValue({ code: 11000 });
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request("POST", JSON.stringify({ ...input, title: "Changed" })))).status).toBe(409);
  });
  it("validates publication and range before connecting", async () => {
    expect((await POST(request("POST", "{}"))).status).toBe(400);
    expect((await GET(request("GET", "", "?since=bad&until=bad"))).status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("refuses publication if unique index cannot be established", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.index.mockRejectedValue(new Error("Index unavailable"));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.create).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("does not issue a published receipt for an unpublished retry", async () => {
    mocks.previous.mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...existing(), published: false }) });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires both explicit dates and authenticates discovery before DB access", async () => {
    expect((await GET(request("GET", "", "?since=2026-10-01T00:00:00Z"))).status).toBe(400);
    expect((await GET(request("GET", "", "?until=2026-10-02T00:00:00Z"))).status).toBe(400);
    const unsigned = new Request("https://playbound.club/api/integrations/nucleas/roundup");
    expect((await GET(unsigned)).status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("discovers the manual baseline without an unbounded catalog scan", async () => {
    const manual = { ...existing(), slug: "new-games-platform-updates", coverageEnd: undefined, publishedAt: new Date(input.coverageEnd) };
    mocks.previous.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(manual) }) });
    mocks.find.mockReturnValue({ select: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) }) });
    const response = await GET(request("GET", ""));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.since).toBe(new Date(input.coverageEnd).toISOString());
    expect(data.baseline.slug).toBe("new-games-platform-updates");
    expect(data.baseline.publishedAt).toBe(data.since);
    expect(mocks.find.mock.calls[0][0].$and[1].publishedAt).toEqual({ $gte: new Date(data.since), $lt: new Date(data.until) });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.index).not.toHaveBeenCalled();
  });
  it("returns null baseline and no games when discovery has no anchor", async () => {
    mocks.previous.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    const response = await GET(request("GET", ""));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ since: null, games: [], baseline: null, lastRoundup: null });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.index).not.toHaveBeenCalled();
  });
  it.each([2000, 2001])("bounds GET and handles %i rows without truncating", async (count) => {
    mocks.previous.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(existing()) }) });
    const limit = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(Array.from({ length: count }, () => ({ _id: input.coveredIds[0], slug: "game", publishedAt: new Date(input.coverageStart) }))) });
    mocks.find.mockReturnValue({ select: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ limit }) }) });
    const response = await GET(request("GET", ""));
    expect(limit).toHaveBeenCalledWith(2001);
    expect(response.status).toBe(count > 2000 ? 422 : 200);
    const result = await response.json();
    if (count > 2000) { expect(result.error).toContain("narrower date range"); expect(result.games).toBeUndefined(); }
    else expect(result.games).toHaveLength(2000);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.index).not.toHaveBeenCalled();
  });
  it("reads actual date-filtered catalog and latest roundup with no writes", async () => {
    mocks.find.mockReturnValue({ select: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: input.coveredIds[0], slug: "real-game", title: "Actual", description: "Actual gameplay", publishedAt: new Date(input.coverageStart) }]) }) }) }) });
    const sort = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...existing(), slug: "new-games-platform-updates" }) });
    mocks.previous.mockReturnValue({ sort });
    const response = await GET(request("GET", "", "?since=2026-10-01T00%3A00%3A00Z&until=2026-10-02T00%3A00%3A00Z"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.games[0].url).toBe("https://playbound.club/games/real-game");
    expect(data.previousRoundup.url).toBe("https://playbound.club/blog/new-games-platform-updates");
    expect(data.baseline.publishedAt).toBe(new Date(input.coverageEnd).toISOString());
    expect(data.lastRoundup).toEqual(data.baseline);
    expect(data.baseline.coveredIds).toEqual(input.coveredIds);
    expect(data.games[0].priceType).toBe("FREE");
    expect(mocks.find.mock.calls[0][0].$and[1]).toEqual({ publishedAt: { $gte: new Date(input.coverageStart), $lt: new Date(input.coverageEnd) } });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.index).not.toHaveBeenCalled();
    expect(data.limitations[0]).toContain("not guaranteed first publication");
  });
});


