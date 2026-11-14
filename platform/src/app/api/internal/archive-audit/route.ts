import crypto from "node:crypto";
import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import CatalogMod from "@/lib/models/CatalogMod";
import { mirrorArchiveKeys } from "@/lib/mirrors/archiveReferences";
import { headS3ArchiveObject } from "@/lib/mirrors/s3Archive";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.GAME_HOST_SECRET;
  if (!secret) return false;
  const actual = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Read-only cutover audit of the DB source of truth, not seed rows. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await dbConnect();
    const [games, editions, mods] = await Promise.all([
      CatalogGame.find({}).select("slug launcherInstall").lean(),
      Edition.find({ suppressesSeed: { $ne: true } }).select("gameSlug slug installConfig").lean(),
      CatalogMod.find({}).select("slug directUrl directUrlMac directUrlLinux").lean(),
    ]);
    const references = new Map<string, string[]>();
    const add = (owner: string, recipe: unknown) => {
      for (const key of mirrorArchiveKeys(recipe)) {
        references.set(key, [...(references.get(key) || []), owner]);
      }
    };
    for (const game of games) add(`game:${game.slug}`, game.launcherInstall);
    for (const edition of editions) add(`edition:${edition.gameSlug}/${edition.slug}`, edition.installConfig);
    for (const mod of mods) add(`mod:${mod.slug}`, [mod.directUrl, mod.directUrlMac, mod.directUrlLinux]);
    const keys = [...references.keys()].sort();
    const missing: Array<{ key: string; owners: string[] }> = [];
    const errors: Array<{ key: string; owners: string[] }> = [];
    for (let i = 0; i < keys.length; i += 8) {
      await Promise.all(keys.slice(i, i + 8).map(async (key) => {
        try {
          const result = await headS3ArchiveObject(key);
          if (!result.exists) missing.push({ key, owners: references.get(key) || [] });
        } catch {
          errors.push({ key, owners: references.get(key) || [] });
        }
      }));
    }
    return NextResponse.json({
      scanned: { games: games.length, editions: editions.length, mods: mods.length },
      referencedKeys: keys.length, missing, errors,
      readyForGameMirrorCutover: missing.length === 0 && errors.length === 0,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("Archive cutover audit failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Archive cutover audit failed" }, { status: 503 });
  }
}
