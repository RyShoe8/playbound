import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { developersBySlug } from "@/lib/data";
import { gamePayloadSchema, withDefaultArt, withDefaultLauncherInstall } from "@/lib/gamePayload";
import { requireAdminSession } from "@/lib/requireAdmin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    const body = withDefaultLauncherInstall(withDefaultArt(gamePayloadSchema.parse(await req.json())));
    await dbConnect();

    if (body.slug !== slug) {
      const clash = await CatalogGame.findOne({ slug: body.slug }).lean();
      if (clash) {
        return NextResponse.json({ error: "New slug already exists" }, { status: 409 });
      }
    }

    if (body.gameOfWeek) {
      await CatalogGame.updateMany(
        { gameOfWeek: true, slug: { $ne: slug } },
        { $set: { gameOfWeek: false } }
      );
    }

    const developerName =
      body.developerName || developersBySlug.get(body.developerSlug)?.name || null;

    const doc = await CatalogGame.findOneAndUpdate(
      { slug },
      {
        $set: {
          ...body,
          githubRepo: body.githubRepo || null,
          coverImage: body.coverImage || null,
          screenshots: body.screenshots ?? [],
          launcherInstall: body.launcherInstall || null,
          developerName,
          submissionId: body.submissionId || null,
          managedBy: body.managedBy || "admin",
          ownerUserId: body.ownerUserId || null,
        },
      },
      { new: true }
    );

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, slug: doc.slug });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin update game error:", err);
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
    const doc = await CatalogGame.findOneAndDelete({ slug });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin delete game error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
