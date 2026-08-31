import { cacheLife, cacheTag } from "next/cache";
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
async function loadPublished(): Promise<Developer[]> {
  /*
   * A cache boundary, not just per-request memoization — see the same change
   * in collections.ts. mongoose reads the clock inside dbConnect, which Cache
   * Components forbids during a prerender unless the work is behind "use
   * cache", so every /developers/[slug] page failed to build.
   *
   * The "developers" tag already exists; the admin routes invalidate it.
   */
  "use cache";
  cacheLife("hours");
  cacheTag("developers");
  try {
    await dbConnect();
    const docs = await DeveloperModel.find({ published: true }).sort({ name: 1 }).lean();
    if (docs.length > 0) return docs.map((d) => toDeveloper(d as LeanDeveloper));
  } catch (err) {
    console.error("[developers] read failed, falling back to seed:", err);
  }
  return [...seedDevelopers].sort((a, b) => a.name.localeCompare(b.name));
}

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

/**
 * Ensures a developer exists in MongoDB. If not found by slug or name, creates one.
 */
export async function ensureDeveloperExists(
  developerSlug: string,
  developerName?: string | null
): Promise<{ slug: string; name: string }> {
  await dbConnect();

  let slug = (developerSlug || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const trimmedName = (developerName || "").trim();

  if (!slug && trimmedName) {
    slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  if (!slug) {
    slug = "indie-web";
  }

  const name =
    trimmedName ||
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  // 1. Check database by slug
  const docBySlug = await DeveloperModel.findOne({ slug });
  if (docBySlug) {
    return { slug: String(docBySlug.slug), name: String(docBySlug.name) };
  }

  // 2. Check database by exact name
  if (trimmedName) {
    const docByName = await DeveloperModel.findOne({ name: trimmedName });
    if (docByName) {
      return { slug: String(docByName.slug), name: String(docByName.name) };
    }
  }

  // 3. Check seed developers
  const seed = seedDevelopers.find(
    (s) => s.slug === slug || (trimmedName && s.name.toLowerCase() === trimmedName.toLowerCase())
  );
  if (seed) {
    try {
      await DeveloperModel.create({
        slug: seed.slug,
        name: seed.name,
        tagline: seed.tagline || "",
        about: seed.about || "",
        founded: seed.founded || 0,
        location: seed.location || "",
        website: seed.website || "",
        artHue: seed.artHue || 210,
        published: true,
      });
    } catch {
      /* ignore race condition */
    }
    return { slug: seed.slug, name: seed.name };
  }

  // 4. Create new developer in DB
  try {
    const newDoc = await DeveloperModel.create({
      slug,
      name,
      tagline: "",
      about: "",
      founded: 0,
      location: "",
      website: "",
      artHue: Math.floor(Math.random() * 360),
      published: true,
    });
    return { slug: String(newDoc.slug), name: String(newDoc.name) };
  } catch (err) {
    const clash = await DeveloperModel.findOne({ slug });
    if (clash) return { slug: String(clash.slug), name: String(clash.name) };
    throw err;
  }
}
