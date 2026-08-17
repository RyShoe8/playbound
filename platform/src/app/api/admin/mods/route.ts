import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogMod from "@/lib/models/CatalogMod";
import { developersBySlug } from "@/lib/data";
import { ensureDeveloperExists } from "@/lib/developers";
import { getGame } from "@/lib/catalog";
import { modPayloadSchema, withDefaultModArt } from "@/lib/modPayload";
import { withSyncedPublished } from "@/lib/catalogStatus";
import { requireAdminSession } from "@/lib/requireAdmin";
import { listAllMods } from "@/lib/mods";
import {
  ensureDerivedModFields,
  modEditorialReadiness,
  publishBlockedMessage,
} from "@/lib/enrich";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  const mods = await listAllMods();
  return NextResponse.json({ mods });
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const parsed = withDefaultModArt(modPayloadSchema.parse(await req.json()));
    const baseGame = await getGame(parsed.baseGameSlug, { includeUnpublished: true });
    if (!baseGame) {
      return NextResponse.json({ error: "Unknown base game slug" }, { status: 400 });
    }

    const body = withSyncedPublished(ensureDerivedModFields(parsed, baseGame.title));

    if (body.status === "published") {
      const readiness = modEditorialReadiness(body);
      if (!readiness.ready) {
        return NextResponse.json(
          { error: publishBlockedMessage("mod", readiness.missing), readiness },
          { status: 422 }
        );
      }
    }

    await dbConnect();
    const exists = await CatalogMod.findOne({ slug: body.slug }).lean();
    if (exists) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    let developerSlug = body.developerSlug;
    let developerName = body.developerName;
    if (developerSlug) {
      const dev = await ensureDeveloperExists(developerSlug, developerName);
      developerSlug = dev.slug;
      developerName = dev.name;
    } else {
      developerName = developerName || developersBySlug.get(developerSlug)?.name || null;
    }

    const doc = await CatalogMod.create({
      ...body,
      developerSlug,
      developerName,
      githubRepo: body.githubRepo || null,
      assetPattern: body.assetPattern || null,
      directUrl: body.directUrl || null,
      coverImage: body.coverImage || null,
      screenshots: body.screenshots ?? [],
      ownerUserId: body.ownerUserId || null,
      managedBy: body.managedBy || "admin",
    });

    revalidateTag("mods", { expire: 0 });
    revalidateTag("developers", { expire: 0 });
    return NextResponse.json({ success: true, slug: doc.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin create mod error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
