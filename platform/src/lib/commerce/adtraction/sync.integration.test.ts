import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import StoreProvider from "@/lib/models/StoreProvider";
import AffiliateTransaction from "@/lib/models/AffiliateTransaction";
import AffiliateSyncState from "@/lib/models/AffiliateSyncState";
import { syncAdtraction } from "./sync";
import { adtractionReport } from "./report";

const db = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/db", () => ({ default: db }));
let mongo: MongoMemoryServer;
const DAY = 86_400_000;
const now = () => new Date();
const date = (days: number) => new Date(Date.now() - days * DAY).toISOString();
function sale(id = "one", status = 1, gameSlug: string | null = "morrowind", currency = "USD") {
  return { uniqueId: id, transactionDate: date(0.1), transactionType: 3, transactionStatus: status, commission: 1.25, currency,
    click: { channelId: 123, programId: 456, epi5: gameSlug ? `pb-game:${gameSlug}` : undefined } };
}
function upstream(rows: ReturnType<typeof sale>[]) {
  return vi.fn<typeof fetch>(async (_url, request) => {
    const { fromDate, toDate } = JSON.parse(String(request?.body));
    return Response.json(rows.filter((row) => Date.parse(row.transactionDate) >= Date.parse(fromDate) && Date.parse(row.transactionDate) <= Date.parse(toDate)));
  });
}
async function allowRetry() {
  await AffiliateSyncState.updateOne({ _id: "adtraction:sync" }, { $set: { nextAttemptAt: new Date(0) } });
}
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "adtraction-isolated-test" });
}, 120_000);
beforeEach(async () => {
  await Promise.all([StoreProvider.deleteMany({}), AffiliateTransaction.deleteMany({}), AffiliateSyncState.deleteMany({})]);
  await StoreProvider.create({ slug: "gog", name: "GOG", baseUrl: "https://www.gog.com", affiliateUrlTemplate: "https://track.adtraction.com/t/t?a=456&as=123&url={url}" });
  vi.stubEnv("ADTRACTION_API_TOKEN", "test-token-never-real");
  vi.stubEnv("ADTRACTION_REPORT_FROM", date(2).slice(0, 10));
  db.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

it("is inert without a token and shows unavailable, not zero sales, before the first sync", async () => {
  vi.stubEnv("ADTRACTION_API_TOKEN", "");
  const fetcher = upstream([]);
  expect((await syncAdtraction({ fetcher })).status).toBe("disabled");
  expect(db).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(await AffiliateSyncState.countDocuments()).toBe(0);
  expect((await adtractionReport(["morrowind"])).byGame).toBeNull();
});

it("imports once, separates statuses/currencies, excludes leads, and updates approvals and rejections", async () => {
  const rows = [sale(), sale("two", 2), sale("three", 1, null, "SEK"), { ...sale("lead"), transactionType: 4 }];
  const fetcher = upstream(rows);
  expect((await syncAdtraction({ fetcher })).status).toBe("success");
  let report = await adtractionReport(["morrowind", "zero"]);
  expect(report.byGame?.morrowind).toEqual({ approved: 1, pending: 1, rejected: 0 });
  expect(report.byGame?.zero).toEqual({ approved: 0, pending: 0, rejected: 0 });
  expect(report.unattributed).toBe(1);
  expect(report.historyComplete).toBe(true);
  expect(report.commission).toEqual([{ currency: "SEK", approved: 1.25, pending: 0 }, { currency: "USD", approved: 1.25, pending: 1.25 }]);
  rows[0].transactionStatus = 5;
  rows[1].transactionStatus = 1;
  await allowRetry();
  await syncAdtraction({ fetcher });
  expect(await AffiliateTransaction.countDocuments()).toBe(4);
  report = await adtractionReport(["morrowind"]);
  expect(report.byGame?.morrowind).toEqual({ approved: 1, pending: 0, rejected: 1 });
  expect(JSON.stringify(await AffiliateTransaction.find().lean())).not.toContain("test-token");
});

it("does not let concurrent workers provision duplicate reports or bypass the cooldown", async () => {
  const fetcher = upstream([sale()]);
  const results = await Promise.all([syncAdtraction({ fetcher }), syncAdtraction({ fetcher })]);
  expect(results.map((result) => result.status).sort()).toEqual(["busy", "success"]);
  expect(await AffiliateTransaction.countDocuments()).toBe(1);
  expect((await syncAdtraction({ fetcher })).status).toBe("busy");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("preserves saved counts and its checkpoint after authentication or upstream failures", async () => {
  await syncAdtraction({ fetcher: upstream([sale()]) });
  await allowRetry();
  const before = await AffiliateSyncState.findById("adtraction:channel:123").lean();
  const fetcher = vi.fn().mockResolvedValue(new Response("secret test-token-never-real", { status: 403 }));
  expect((await syncAdtraction({ fetcher })).status).toBe("failed");
  const after = await AffiliateSyncState.findById("adtraction:channel:123").lean();
  expect(after?.cursor).toEqual(before?.cursor);
  expect(after?.lastSyncedAt).toEqual(before?.lastSyncedAt);
  const report = await adtractionReport(["morrowind"]);
  expect(report.byGame?.morrowind.approved).toBe(1);
  expect(report.error).toContain("rejected API access");
  expect(JSON.stringify(await AffiliateSyncState.find().lean())).not.toContain("test-token");
});

it("resumes a bounded historical scan without restarting or double-counting", async () => {
  vi.stubEnv("ADTRACTION_REPORT_FROM", date(100).slice(0, 10));
  const old = { ...sale("old"), transactionDate: date(90) };
  const fetcher = upstream([old, sale()]);
  expect((await syncAdtraction({ fetcher, maxRequests: 2 })).status).toBe("partial");
  const first = await AffiliateSyncState.findById("adtraction:channel:123").lean();
  expect(first?.cursor!.getTime()).toBeGreaterThan(first!.reportFrom!.getTime());
  expect((await adtractionReport(["morrowind"])).historyComplete).toBe(false);
  for (let pass = 0; pass < 3; pass++) { await allowRetry(); await syncAdtraction({ fetcher, maxRequests: 2 }); }
  const report = await adtractionReport(["morrowind"]);
  expect(report.historyComplete).toBe(true);
  expect(report.byGame?.morrowind.approved).toBe(2);
  expect(await AffiliateTransaction.countDocuments()).toBe(2);
});

it("refreshes older approvals daily and retires vanished records only after a complete response", async () => {
  vi.stubEnv("ADTRACTION_REPORT_FROM", date(40).slice(0, 10));
  const rows = [{ ...sale("old", 2), transactionDate: date(30) }, sale()];
  const fetcher = upstream(rows);
  await syncAdtraction({ fetcher });
  rows[0].transactionStatus = 1;
  rows.pop();
  await AffiliateSyncState.updateOne({ _id: "adtraction:channel:123" }, { $set: { lastFullSyncAt: new Date(Date.now() - 2 * DAY) } });
  await allowRetry();
  await syncAdtraction({ fetcher });
  const report = await adtractionReport(["morrowind"]);
  expect(report.byGame?.morrowind).toEqual({ approved: 1, pending: 0, rejected: 0 });
  expect(await AffiliateTransaction.countDocuments({ activeInReport: false })).toBe(1);
});

it("rejects a different channel or wrong date without writing transactions or a success time", async () => {
  const bad = { ...sale(), click: { channelId: 999 } };
  let result = await syncAdtraction({ fetcher: vi.fn().mockResolvedValue(Response.json([bad])) });
  expect(result.status).toBe("failed");
  expect(await AffiliateTransaction.countDocuments()).toBe(0);
  await allowRetry();
  result = await syncAdtraction({ fetcher: vi.fn().mockResolvedValue(Response.json([{ ...sale(), transactionDate: date(200) }])) });
  expect(result.status).toBe("failed");
  expect((await adtractionReport(["morrowind"])).byGame).toBeNull();
});

it("does not modify store or catalog data and needs a configured Adtraction store", async () => {
  const before = await StoreProvider.find().lean();
  await syncAdtraction({ fetcher: upstream([]) });
  expect(await StoreProvider.find().lean()).toEqual(before);
  await StoreProvider.updateOne({ slug: "gog" }, { $set: { affiliateDefault: false } });
  const fetcher = upstream([]);
  expect((await syncAdtraction({ fetcher })).status).toBe("not_configured");
  expect(fetcher).not.toHaveBeenCalled();
});

it("never treats an arbitrary or prototype-named reference as a catalog match", async () => {
  await syncAdtraction({ fetcher: upstream([sale("unknown", 1, "constructor"), sale("other", 1, "not-in-catalog")]) });
  const report = await adtractionReport(["morrowind"]);
  expect(report.unattributed).toBe(2);
  expect(report.byGame?.morrowind.approved).toBe(0);
});

it("rejects invalid history settings without leaking their values", async () => {
  vi.stubEnv("ADTRACTION_REPORT_FROM", "private-malformed-value");
  const result = await syncAdtraction({ now: now(), fetcher: upstream([]) });
  expect(result.status).toBe("failed");
  expect(result.error).toContain("YYYY-MM-DD");
  expect(result.error).not.toContain("private-malformed-value");
});
