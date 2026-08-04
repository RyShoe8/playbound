import { cache } from "react";
import dbConnect from "@/lib/db";
import CatalogCollection from "@/lib/models/CatalogCollection";
import { collections as seedCollections } from "@/lib/data/collections";
import type { Collection } from "@/lib/data/types";

export type { Collection };

type LeanCollection = Record<string, unknown>;

function toCollection(doc: LeanCollection): Collection {
  return {
    slug: String(doc.slug),
    title: String(doc.title),
    description: String(doc.description),
    gameSlugs: (doc.gameSlugs as string[]) ?? [],
  };
}

/**
 * Published collections, memoized per request.
 *
 * Falls back to the static seed while the database is empty, so a fresh
 * environment (or a failed connection) still renders the curated lists rather
 * than an empty Collections page.
 */
const loadPublished = cache(async (): Promise<Collection[]> => {
  try {
    await dbConnect();
    const docs = await CatalogCollection.find({ published: true })
      .sort({ sortOrder: 1, title: 1 })
      .lean();
    if (docs.length > 0) return docs.map((d) => toCollection(d as LeanCollection));
  } catch (err) {
    console.error("[collections] read failed, falling back to seed:", err);
  }
  return seedCollections;
});

export async function listCollections(): Promise<Collection[]> {
  return loadPublished();
}

export async function getCollection(slug: string): Promise<Collection | undefined> {
  const found = (await loadPublished()).find((c) => c.slug === slug);
  if (found) return found;
  return seedCollections.find((c) => c.slug === slug);
}

/** Every collection including drafts, for the admin list. */
export async function listAllCollections(): Promise<
  (Collection & { published: boolean; sortOrder: number; updatedAt?: string })[]
> {
  try {
    await dbConnect();
    const docs = await CatalogCollection.find({})
      .sort({ sortOrder: 1, title: 1 })
      .lean();
    if (docs.length > 0) {
      return docs.map((d) => ({
        ...toCollection(d as LeanCollection),
        published: Boolean((d as LeanCollection).published),
        sortOrder: Number((d as LeanCollection).sortOrder) || 0,
        updatedAt: (d as { updatedAt?: Date }).updatedAt
          ? new Date((d as { updatedAt: Date }).updatedAt).toISOString()
          : undefined,
      }));
    }
  } catch (err) {
    console.error("[collections] listAll failed, falling back to seed:", err);
  }
  return seedCollections.map((c, i) => ({ ...c, published: true, sortOrder: i }));
}

/** Collections featuring a given game, used on the game hub. */
export async function collectionsFeaturingGame(gameSlug: string): Promise<Collection[]> {
  return (await loadPublished()).filter((c) => c.gameSlugs.includes(gameSlug));
}
