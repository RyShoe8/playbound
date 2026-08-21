import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The two properties that stop /gear taking the build down with it, plus the
 * category lookup that replaced a regex built from a URL segment.
 *
 * next/cache is stubbed to call straight through. unstable_cache would
 * otherwise memoize between cases and the second assertion would be reading
 * the first one's result.
 */
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const find = vi.fn();
const findOne = vi.fn();

vi.mock("@/lib/db", () => ({ default: vi.fn(async () => undefined) }));
vi.mock("@/lib/models/Gear", () => ({
  default: {
    find: (...args: unknown[]) => find(...args),
    findOne: (...args: unknown[]) => findOne(...args),
  },
}));

import {
  listPublishedGear,
  listGearByCategory,
  resolveGearCategory,
  groupGearByCategory,
} from "./gear";

function lean(rows: unknown[]) {
  return { lean: async () => rows };
}

beforeEach(() => {
  find.mockReset();
  findOne.mockReset();
});

describe("a database that is not answering", () => {
  it("yields an empty list instead of throwing", async () => {
    // The whole point: /gear prerenders at build time, and an unhandled throw
    // there ends the entire build rather than just that route.
    find.mockReturnValue({
      lean: async () => {
        throw new Error("MongoParseError: Invalid scheme");
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(listPublishedGear()).resolves.toEqual([]);
    await expect(groupGearByCategory()).resolves.toEqual({});
    // Silently swallowing it would hide a real outage.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("resolveGearCategory", () => {
  it("matches a known category regardless of case", () => {
    expect(resolveGearCategory("audio")).toBe("Audio");
    expect(resolveGearCategory("CONTROLLERS")).toBe("Controllers");
  });

  it("refuses anything that is not a real category", () => {
    /*
     * The old query compiled the URL segment into `new RegExp('^'+seg+'$','i')`,
     * so `.*` matched every category at once and a crafted segment could hand
     * an attacker a pathological pattern to run against the collection.
     */
    expect(resolveGearCategory(".*")).toBeNull();
    expect(resolveGearCategory("(a+)+$")).toBeNull();
    expect(resolveGearCategory("")).toBeNull();
    expect(resolveGearCategory("Audio|Mouse")).toBeNull();
  });
});

describe("listGearByCategory", () => {
  it("returns only that category's published items", async () => {
    find.mockReturnValue(
      lean([
        { slug: "pad", title: "Pad", category: "Controllers", status: "published" },
        { slug: "cans", title: "Cans", category: "Audio", status: "published" },
      ])
    );
    const audio = await listGearByCategory("audio");
    expect(audio.map((g) => g.slug)).toEqual(["cans"]);
  });

  it("returns nothing for an injected pattern rather than everything", async () => {
    find.mockReturnValue(
      lean([
        { slug: "pad", title: "Pad", category: "Controllers", status: "published" },
        { slug: "cans", title: "Cans", category: "Audio", status: "published" },
      ])
    );
    expect(await listGearByCategory(".*")).toEqual([]);
  });
});

describe("normalisation", () => {
  it("fills absent fields rather than leaking undefined into the page", async () => {
    // `gear.name` shipped in an alt attribute for exactly this reason — an
    // untyped lean() made a missing field render as "undefined".
    find.mockReturnValue(lean([{ slug: "x", title: "X", category: "Audio" }]));
    const [item] = await listPublishedGear();
    expect(item.screenshots).toEqual([]);
    expect(item.affiliateLinks).toEqual([]);
    expect(item.manufacturer).toBeNull();
    expect(item.description).toBe("");
  });

  it("treats an affiliate link as active unless it says otherwise", async () => {
    find.mockReturnValue(
      lean([
        {
          slug: "x",
          title: "X",
          category: "Audio",
          affiliateLinks: [
            { retailer: "A", url: "https://a", price: "$1" },
            { retailer: "B", url: "https://b", isActive: false },
          ],
        },
      ])
    );
    const [item] = await listPublishedGear();
    expect(item.affiliateLinks.map((l) => l.isActive)).toEqual([true, false]);
  });
});
