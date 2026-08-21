import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import GearModel from "@/lib/models/Gear";
import { GEAR_CATEGORIES } from "@/lib/amazonGear";

/**
 * Read layer for gear, matching the one every other catalog section has.
 *
 * Gear was the only section querying Mongoose straight from its page
 * components, and it cost three things the others get for free:
 *
 *   A build that fails on a database blip. `/gear` has no dynamic API use, so
 *   Next prerenders it — and an unhandled throw there ends the whole build,
 *   not just that route. Every other section reaches the database through a
 *   lib function that catches, logs and returns a fallback.
 *
 *   Content that never updates. With no `revalidate`, the prerender was
 *   permanent: gear added through the admin did not appear until the next
 *   deploy. The 300s window here is the same one catalog and mods use.
 *
 *   No self-healing. Caching an empty result would otherwise be worse than
 *   failing loudly, because it is silent. Revalidation is what makes a
 *   fallback safe — a bad read is replaced within five minutes rather than
 *   frozen into the page.
 */

export type GearAffiliateLink = {
  retailer: string;
  url: string;
  price: string | null;
  shipping: string | null;
  isActive: boolean;
};

export type GearItem = {
  slug: string;
  title: string;
  category: string;
  description: string;
  manufacturer: string | null;
  playboundCertified: boolean;
  coverImage: string | null;
  screenshots: string[];
  videos: string[];
  platforms: string[];
  bestFor: string[];
  status: string;
  affiliateLinks: GearAffiliateLink[];
  updatedAt: string | null;
};

type LeanGear = Record<string, unknown>;

function toGear(doc: LeanGear): GearItem {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  return {
    slug: String(doc.slug ?? ""),
    title: String(doc.title ?? ""),
    category: String(doc.category ?? ""),
    description: String(doc.description ?? ""),
    manufacturer: doc.manufacturer ? String(doc.manufacturer) : null,
    playboundCertified: Boolean(doc.playboundCertified),
    coverImage: doc.coverImage ? String(doc.coverImage) : null,
    screenshots: arr(doc.screenshots),
    videos: arr(doc.videos),
    platforms: arr(doc.platforms),
    bestFor: arr(doc.bestFor),
    status: String(doc.status ?? "draft"),
    affiliateLinks: Array.isArray(doc.affiliateLinks)
      ? (doc.affiliateLinks as Record<string, unknown>[]).map((l) => ({
          retailer: String(l.retailer ?? ""),
          url: String(l.url ?? ""),
          price: l.price ? String(l.price) : null,
          shipping: l.shipping ? String(l.shipping) : null,
          isActive: l.isActive !== false,
        }))
      : [],
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string).toISOString() : null,
  };
}

async function listPublishedGearUncached(): Promise<GearItem[]> {
  try {
    await dbConnect();
    const docs = await GearModel.find({ status: "published" }).lean<LeanGear[]>();
    return docs.map(toGear).sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    console.error("[gear] listPublishedGear failed:", err);
    return [];
  }
}

/** Every published item, cached and revalidated like the rest of the catalog. */
export function listPublishedGear(): Promise<GearItem[]> {
  return unstable_cache(listPublishedGearUncached, ["gear-list", "published"], {
    revalidate: 300,
    tags: ["gear", "catalog"],
  })();
}

/**
 * Resolve a URL segment to a real category name.
 *
 * Matched against the known list rather than compiled into a regex. The old
 * query built `new RegExp('^' + category + '$', 'i')` straight from the route
 * param, so a request for `/gear/.*` matched every category at once and a
 * crafted segment could hand an attacker a pathological pattern to run against
 * the collection. A closed set has neither problem.
 */
export function resolveGearCategory(segment: string): string | null {
  const wanted = String(segment ?? "").toLowerCase();
  return GEAR_CATEGORIES.find((c) => c.toLowerCase() === wanted) ?? null;
}

/** Published items in one category, or [] when the category is not real. */
export async function listGearByCategory(segment: string): Promise<GearItem[]> {
  const category = resolveGearCategory(segment);
  if (!category) return [];
  const all = await listPublishedGear();
  return all.filter((g) => g.category === category);
}

/** Categories that actually have something published in them. */
export async function listGearCategories(): Promise<string[]> {
  const all = await listPublishedGear();
  return [...new Set(all.map((g) => g.category))].sort();
}

/** Published items grouped by category, for the directory page. */
export async function groupGearByCategory(): Promise<Record<string, GearItem[]>> {
  const all = await listPublishedGear();
  const grouped: Record<string, GearItem[]> = {};
  for (const item of all) {
    (grouped[item.category] ??= []).push(item);
  }
  return grouped;
}

/**
 * One item by slug.
 *
 * `includeUnpublished` exists for generateMetadata, which looked a draft up by
 * slug so it could title the page before the component decided to 404. Kept
 * deliberate rather than implicit — the page itself must never render one.
 */
export async function getGear(
  slug: string,
  opts?: { includeUnpublished?: boolean }
): Promise<GearItem | null> {
  if (!slug) return null;
  if (opts?.includeUnpublished) {
    try {
      await dbConnect();
      const doc = await GearModel.findOne({ slug }).lean<LeanGear | null>();
      return doc ? toGear(doc) : null;
    } catch (err) {
      console.error("[gear] getGear failed:", err);
      return null;
    }
  }
  const all = await listPublishedGear();
  return all.find((g) => g.slug === slug) ?? null;
}
