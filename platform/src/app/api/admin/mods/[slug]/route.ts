import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogMod from "@/lib/models/CatalogMod";
import { developersBySlug } from "@/lib/data";
import { getGame } from "@/lib/catalog";
import { modPayloadSchema, withDefaultModArt } from "@/lib/modPayload";
import { withSyncedPublished } from "@/lib/catalogStatus";
import { requireAdminSession } from "@/lib/requireAdmin";

import {
  ensureDerivedModFields,
  modEditorialReadiness,
  publishBlockedMessage,
} from "@/lib/enrich";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
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

    if (body.slug !== slug) {
      const clash = await CatalogMod.findOne({ slug: body.slug }).lean();
      if (clash) {
        return NextResponse.json({ error: "New slug already exists" }, { status: 409 });
      }
    }

    const developerName =
      body.developerName || developersBySlug.get(body.developerSlug)?.name || null;

    const doc = await CatalogMod.findOneAndUpdate(
      { slug },
      {
        $set: {
          ...body,
          githubRepo: body.githubRepo || null,
          assetPattern: body.assetPattern || null,
          directUrl: body.directUrl || null,
          coverImage: body.coverImage || null,
          screenshots: body.screenshots ?? [],
          developerName,
          ownerUserId: body.ownerUserId || null,
          managedBy: body.managedBy || "admin",
        },
      },
      { new: true }
    );

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    revalidateTag("mods", { expire: 0 });
    return NextResponse.json({ success: true, slug: doc.slug });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin update mod error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    await dbConnect();
    const doc = await CatalogMod.findOneAndDelete({ slug });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    revalidateTag("mods", { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin delete mod error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
