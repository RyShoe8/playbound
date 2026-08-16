import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { developersBySlug } from "@/lib/data";
import { gamePayloadSchema, withDefaultArt, withDefaultLauncherInstall } from "@/lib/gamePayload";
import { withSyncedPublished } from "@/lib/catalogStatus";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  ensureDerivedGameFields,
  editorialReadiness,
  publishBlockedMessage,
} from "@/lib/enrich";
import { requestDiscordProvision, hasPlayboundDiscordChannel, requestNewGameDiscordAnnounce } from "@/lib/discordProvision";
import {
  cascadeGameSlugRename,
  staticReferenceWarning,
  type SlugRenameReport,
} from "@/lib/renameGameSlug";
import { firstZodErrorMessage } from "@/lib/zodError";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    const raw = await req.json();
    const forcePublish = Boolean(
      raw && typeof raw === "object" && "forcePublish" in raw && (raw as { forcePublish?: unknown }).forcePublish
    );
    const body = withSyncedPublished(
      ensureDerivedGameFields(
        withDefaultLauncherInstall(withDefaultArt(gamePayloadSchema.parse(raw)))
      )
    );

    // Drafts/testing save freely; publishing requires editorial fields unless forced.
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

    const isRename = body.slug !== slug;

    if (isRename) {
      // Reject a collision with a live slug *or* with any slug already retired
      // by another game, since those still resolve via redirect.
      const clash = await CatalogGame.findOne({
        $or: [{ slug: body.slug }, { previousSlugs: body.slug }],
      }).lean();
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

    const previous = await CatalogGame.findOne({ slug }).select("published publishedAt status").lean();
    let publishedAt = (previous as { publishedAt?: Date | null })?.publishedAt;
    if (body.status === "published" && (!publishedAt || (previous as { status?: string })?.status !== "published")) {
      publishedAt = new Date();
    }

    const doc = await CatalogGame.findOneAndUpdate(
      { slug },
      {
        $set: {
          ...body,
          publishedAt: body.status === "published" ? (publishedAt ?? new Date()) : null,
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
        },
        // Retain the old slug so its indexed URLs keep resolving.
        ...(isRename ? { $addToSet: { previousSlugs: slug } } : {}),
      },
      { returnDocument: "after" }
    );

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Slugs are foreign keys by value, so the rename has to be carried across
    // libraries, reviews, guides, discussions, mods and events by hand.
    let renamed: SlugRenameReport | undefined;
    let renameWarning: string | undefined;
    if (isRename) {
      renamed = await cascadeGameSlugRename(slug, doc.slug);
      renameWarning = staticReferenceWarning(slug);
    }

    if (doc.published && !hasPlayboundDiscordChannel(doc)) {
      void requestDiscordProvision(doc.slug);
    }
    if (doc.published && !previous?.published) {
      void requestNewGameDiscordAnnounce({
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        tagline: doc.tagline,
        coverImage: doc.coverImage,
        screenshots: doc.screenshots,
      });
    }

    revalidateTag("catalog", { expire: 0 });
    return NextResponse.json({
      success: true,
      slug: doc.slug,
      ...(isRename ? { renamedFrom: slug, renamed, renameWarning } : {}),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 400 });
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
    revalidateTag("catalog", { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin delete game error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
