import { expect, it, vi } from "vitest";
import { fetchTransactions, normalizeTransaction, safeAdtractionError } from "./client";
import { adtractionChannelId, gameFromAdtractionClick, withAdtractionGameReference } from "./attribution";
import { withStoreAffiliate } from "@/lib/access/storeUrls";
import { toLauncherCommerce } from "@/lib/launcherCommerce";
import { buildStoreUrl } from "@/lib/storeDiscounts/service";

const row = { uniqueId: "sale-1", transactionDate: "2026-11-01T00:00:00Z", transactionType: 3, transactionStatus: 1, commission: 1.25, currency: "USD", click: { channelId: 123, programId: 456, epi5: "pb-game:morrowind" } };
const input = { token: "private-test-token", channelId: "123", from: new Date("2026-11-01"), to: new Date("2026-11-30") };
const template = "https://track.adtraction.com/t/t?a=456&as=123&t=2&url={url}";

it("sends the token only in the header and requests every transaction status", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([row], { headers: { count: "1" } }));
  const rows = await fetchTransactions({ ...input, fetcher });
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.adtraction.net/v2/partner/transactions/");
  expect(request).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { "X-Token": input.token } });
  expect(JSON.parse(String(request?.body))).toMatchObject({ channelId: 123, transactionStatus: 0 });
  expect(request?.body).not.toContain(input.token);
  expect(rows[0]).toMatchObject({ _id: "adtraction:sale-1", gameSlug: "morrowind", status: 1, channelId: "123" });
  expect(JSON.stringify(rows)).not.toContain(input.token);
});

it.each([[], { message: "No transactions found." }, "No transactions found."])("accepts the documented empty-report response %j", async (body) => {
  expect(await fetchTransactions({ ...input, fetcher: vi.fn().mockResolvedValue(Response.json(body)) })).toEqual([]);
});

it.each([401, 403, 429, 500, 302])("reports HTTP %s without exposing upstream bodies or credentials", async (status) => {
  const fetcher = vi.fn().mockResolvedValue(new Response(`secret ${input.token}`, { status, headers: { "retry-after": "120" } }));
  try { await fetchTransactions({ ...input, fetcher }); expect.fail("should reject"); }
  catch (error) { expect(safeAdtractionError(error)).not.toContain(input.token); expect(safeAdtractionError(error)).not.toContain("secret"); }
});

it("fails closed on malformed, cross-channel or truncated data", async () => {
  expect(() => normalizeTransaction({ ...row, transactionStatus: 99 }, "123")).toThrow();
  expect(() => normalizeTransaction(row, "999")).toThrow(/different channel/);
  await expect(fetchTransactions({ ...input, fetcher: vi.fn().mockResolvedValue(Response.json([row], { headers: { count: "2" } })) })).rejects.toThrow(/incomplete/);
  await expect(fetchTransactions({ ...input, fetcher: vi.fn().mockResolvedValue(Response.json({ token: input.token })) })).rejects.toThrow(/unrecognized/);
  await expect(fetchTransactions({ ...input, fetcher: vi.fn().mockRejectedValue(new Error(input.token)) })).rejects.toThrow(/could not be reached/);
});

it("adds a game reference on the tracking link while preserving the destination and existing EPI", () => {
  const dest = "https://www.gog.com/en/game/morrowind?utm_content=morrowind";
  const url = new URL(withStoreAffiliate(dest, { affiliate: true, template: `${template}&epi=existing`, gameSlug: "morrowind" }));
  expect(url.searchParams.get("url")).toBe(dest);
  expect(url.searchParams.get("epi")).toBe("existing");
  expect(url.searchParams.get("epi5")).toBe("pb-game:morrowind");
  expect(adtractionChannelId(url.toString())).toBe("123");
  expect(withAdtractionGameReference(url.toString(), "morrowind")).toBe(url.toString());
  expect(gameFromAdtractionClick(Object.fromEntries(url.searchParams))).toBe("morrowind");
});

it("does not stamp other stores, disabled affiliates, ambiguous references or full custom EPI fields", () => {
  const direct = "https://www.gog.com/en/game/morrowind";
  expect(withStoreAffiliate(direct, { affiliate: false, template, gameSlug: "morrowind" })).toBe(direct);
  expect(withAdtractionGameReference(direct, "morrowind")).toBe(direct);
  expect(adtractionChannelId("https://track.adtraction.com.evil.test/t/t?as=123")).toBeNull();
  expect(gameFromAdtractionClick({ epi: "Morrowind GOTY", epi5: "" })).toBeNull();
  expect(gameFromAdtractionClick({ epi: "pb-game:morrowind", epi5: "pb-game:other" })).toBeNull();
  const full = "https://track.adtraction.com/t/t?as=123&epi=1&epi2=2&epi3=3&epi4=4&epi5=5";
  expect(withAdtractionGameReference(full, "morrowind")).toBe(full);
});

it("includes the same referral on launcher and matched Deals purchase URLs", () => {
  const affiliates = { GOG: { template } };
  const access = { priceType: "PAID" as const, regularPriceCents: 599, currentPriceCents: 599, qualifyingPriceCents: 599, currency: "USD" as const, purchaseRequired: true, offers: [{ retailer: "GOG", url: "https://www.gog.com/game/morrowind", priceCents: 599, affiliate: true, isActive: true, matchSource: "manual" as const, lastCheckedAt: null }] };
  const commerce = toLauncherCommerce({ slug: "morrowind", access }, null, affiliates);
  expect(new URL(commerce.buy!.url).searchParams.get("epi5")).toBe("pb-game:morrowind");
  const deal = buildStoreUrl(access.offers[0].url, "gog", true, affiliates, "morrowind");
  expect(new URL(deal).searchParams.get("epi5")).toBe("pb-game:morrowind");
});
