import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { developersBySlug } from "@/lib/data";
import { gamePayloadSchema, withDefaultArt, withDefaultLauncherInstall } from "@/lib/gamePayload";
import { requireAdminSession } from "@/lib/requireAdmin";
import { listAllGames } from "@/lib/catalog";
import {
  ensureDerivedGameFields,
  editorialReadiness,
  publishBlockedMessage,
} from "@/lib/enrich";
import type { Game } from "@/lib/data/types";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  const games = await listAllGames();
  return NextResponse.json({ games });
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = ensureDerivedGameFields(
      withDefaultLauncherInstall(withDefaultArt(gamePayloadSchema.parse(await req.json())))
    );

    // Drafts save freely; publishing requires the human-written fields.
    if (body.published) {
      const readiness = editorialReadiness(body);
      if (!readiness.ready) {
        return NextResponse.json(
          { error: publishBlockedMessage("game", readiness.missing), readiness },
          { status: 422 }
        );
      }
    }

    await dbConnect();

    const exists = await CatalogGame.findOne({ slug: body.slug }).lean();
    if (exists) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    const developerName =
      body.developerName || developersBySlug.get(body.developerSlug)?.name || null;

    if (body.gameOfWeek) {
      await CatalogGame.updateMany({ gameOfWeek: true }, { $set: { gameOfWeek: false } });
    }

    const doc = await CatalogGame.create({
      ...body,
      steamAppId: body.steamAppId || null,
      githubRepo: body.githubRepo || null,
      coverImage: body.coverImage || null,
      screenshots: body.screenshots ?? [],
      launcherInstall: body.launcherInstall || null,
      serverLobbyAuth: body.serverLobbyAuth || null,
      developerName,
      submissionId: body.submissionId || null,
      managedBy: body.managedBy || "admin",
      ownerUserId: body.ownerUserId || null,
    });

    return NextResponse.json({ success: true, slug: doc.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin create game error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
