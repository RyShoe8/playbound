import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { developersBySlug } from "@/lib/data";
import { ensureDeveloperExists } from "@/lib/developers";
import { gamePayloadSchema, withDefaultArt, withDefaultLauncherInstall } from "@/lib/gamePayload";
import { withSyncedPublished } from "@/lib/catalogStatus";
import { requireAdminSession } from "@/lib/requireAdmin";
import { listAllGames } from "@/lib/catalog";
import {
  ensureDerivedGameFields,
  editorialReadiness,
  publishBlockedMessage,
} from "@/lib/enrich";
import { requestDiscordProvision, hasPlayboundDiscordChannel, requestNewGameDiscordAnnounce } from "@/lib/discordProvision";
import { firstZodErrorMessage } from "@/lib/zodError";

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

    const raw = await req.json();
    const forcePublish = Boolean(
      raw && typeof raw === "object" && "forcePublish" in raw && (raw as { forcePublish?: unknown }).forcePublish
    );
    const body = withSyncedPublished(
      ensureDerivedGameFields(
        withDefaultLauncherInstall(withDefaultArt(gamePayloadSchema.parse(raw)))
      )
    );

    if (body.status === "published") {
      const readiness = editorialReadiness(body);
      if (!readiness.ready && !forcePublish) {
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

    let developerSlug = body.developerSlug;
    let developerName = body.developerName;
    if (developerSlug) {
      const dev = await ensureDeveloperExists(developerSlug, developerName);
      developerSlug = dev.slug;
      developerName = dev.name;
    } else {
      developerName = developerName || developersBySlug.get(developerSlug)?.name || null;
    }

    if (body.gameOfWeek) {
      await CatalogGame.updateMany({ gameOfWeek: true }, { $set: { gameOfWeek: false } });
    }

    const doc = await CatalogGame.create({
      ...body,
      developerSlug,
      developerName,
      steamAppId: body.steamAppId || null,
      githubRepo: body.githubRepo || null,
      coverImage: body.coverImage || null,
      screenshots: body.screenshots ?? [],
      launcherInstall: body.launcherInstall || null,
      serverLobbyAuth: body.serverLobbyAuth || null,
      submissionId: body.submissionId || null,
      managedBy: body.managedBy || "admin",
      ownerUserId: body.ownerUserId || null,
    });

    const isPublished = doc.status === "published" || Boolean(doc.published);
    if (isPublished && !hasPlayboundDiscordChannel(doc)) {
      await requestDiscordProvision(doc.slug);
    }
    if (isPublished) {
      await requestNewGameDiscordAnnounce({
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        tagline: doc.tagline,
        coverImage: doc.coverImage,
        screenshots: doc.screenshots,
      });
    }

    revalidateTag("catalog", { expire: 0 });
    revalidateTag("developers", { expire: 0 });
    return NextResponse.json({ success: true, slug: doc.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 400 });
    }
    console.error("Admin create game error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
