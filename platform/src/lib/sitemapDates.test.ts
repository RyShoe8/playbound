import { describe, it, expect } from "vitest";
import { lastMod, newestUpdate } from "@/lib/sitemapDates";

/*
 * The point of these helpers is what they refuse to emit. A sitemap that
 * stamps the generation time onto every URL trains Google to ignore lastmod
 * altogether, so "no date" has to stay a real outcome rather than quietly
 * becoming "now".
 */
describe("lastMod", () => {
  it("omits the field entirely when there is no date", () => {
    expect(lastMod(undefined)).toEqual({});
    expect(lastMod(null)).toEqual({});
    expect(lastMod("")).toEqual({});
  });

  it("omits the field for a date it cannot parse", () => {
    expect(lastMod("not a date")).toEqual({});
  });

  it("keeps a real date", () => {
    const iso = "2026-08-15T00:00:00.000Z";
    expect(lastMod(iso).lastModified?.toISOString()).toBe(iso);
    expect(lastMod(new Date(iso)).lastModified?.toISOString()).toBe(iso);
  });
});

describe("newestUpdate", () => {
  it("returns null rather than a fallback date for an empty set", () => {
    expect(newestUpdate([])).toBeNull();
    expect(newestUpdate([{ updatedAt: undefined }, { updatedAt: null }])).toBeNull();
  });

  it("picks the newest and ignores unparseable entries", () => {
    const newest = newestUpdate([
      { updatedAt: "2026-07-01T00:00:00.000Z" },
      { updatedAt: "garbage" },
      { updatedAt: "2026-08-20T00:00:00.000Z" },
      { updatedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    expect(newest?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("feeds straight into lastMod, so an empty set yields no field", () => {
    expect(lastMod(newestUpdate([]))).toEqual({});
  });
});
