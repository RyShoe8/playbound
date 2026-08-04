import { cache } from "react";
import dbConnect from "@/lib/db";
import DeveloperModel from "@/lib/models/Developer";
import { developers as seedDevelopers } from "@/lib/data/developers";
import type { Developer } from "@/lib/data/types";

export type { Developer };

type LeanDeveloper = Record<string, unknown>;

function toDeveloper(doc: LeanDeveloper): Developer {
  return {
    slug: String(doc.slug),
    name: String(doc.name),
    tagline: String(doc.tagline ?? ""),
    about: String(doc.about ?? ""),
    founded: Number(doc.founded) || 0,
    location: String(doc.location ?? ""),
    website: String(doc.website ?? ""),
    artHue: Number(doc.artHue) || 210,
  };
}

/**
 * Published developers, memoized per request.
 *
 * Falls back to the static seed while the database is empty, so a fresh
 * environment (or an unreachable database) still renders developer profiles
 * and still populates the Developer dropdown in the admin editors, rather than
 * offering an empty list that would make games unsaveable.
 */
const loadPublished = cache(async (): Promise<Developer[]> => {
  try {
    await dbConnect();
    const docs = await DeveloperModel.find({ published: true }).sort({ name: 1 }).lean();
    if (docs.length > 0) return docs.map((d) => toDeveloper(d as LeanDeveloper));
  } catch (err) {
    console.error("[developers] read failed, falling back to seed:", err);
  }
  return [...seedDevelopers].sort((a, b) => a.name.localeCompare(b.name));
});

export async function listDevelopers(): Promise<Developer[]> {
  return loadPublished();
}

export async function getDeveloper(slug: string): Promise<Developer | undefined> {
  if (!slug) return undefined;
  const found = (await loadPublished()).find((d) => d.slug === slug);
  if (found) return found;
  // A draft (unpublished) developer must still resolve for pages that already
  // reference it, otherwise unpublishing one would blank the credit on every
  // game it made rather than just hiding it from the index.
  try {
    await dbConnect();
    const doc = await DeveloperModel.findOne({ slug }).lean();
    if (doc) return toDeveloper(doc as LeanDeveloper);
  } catch {
    // fall through to seed
  }
  return seedDevelopers.find((d) => d.slug === slug);
}

/** Every developer including drafts, for the admin list. */
export async function listAllDevelopers(): Promise<
  (Developer & { published: boolean; updatedAt?: string })[]
> {
  try {
    await dbConnect();
    const docs = await DeveloperModel.find({}).sort({ name: 1 }).lean();
    if (docs.length > 0) {
      return docs.map((d) => ({
        ...toDeveloper(d as LeanDeveloper),
        published: (d as LeanDeveloper).published !== false,
        updatedAt: (d as { updatedAt?: Date }).updatedAt
          ? new Date((d as { updatedAt: Date }).updatedAt).toISOString()
          : undefined,
      }));
    }
  } catch (err) {
    console.error("[developers] listAll failed, falling back to seed:", err);
  }
  return [...seedDevelopers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ ...d, published: true }));
}

/**
 * One developer including its published flag, for the admin editor.
 *
 * The public getDeveloper() deliberately drops `published` because no public
 * surface needs it; the edit form does, or saving a draft would silently
 * republish it.
 */
export async function getDeveloperAdmin(
  slug: string
): Promise<(Developer & { published: boolean }) | undefined> {
  try {
    await dbConnect();
    const doc = await DeveloperModel.findOne({ slug }).lean();
    if (doc) {
      return {
        ...toDeveloper(doc as LeanDeveloper),
        published: (doc as LeanDeveloper).published !== false,
      };
    }
  } catch (err) {
    console.error("[developers] getDeveloperAdmin failed, falling back to seed:", err);
  }
  const seed = seedDevelopers.find((d) => d.slug === slug);
  return seed ? { ...seed, published: true } : undefined;
}

/** Slug → developer, for callers resolving several at once. */
export async function developersBySlugMap(): Promise<Map<string, Developer>> {
  return new Map((await loadPublished()).map((d) => [d.slug, d]));
}
