import { NextResponse } from "next/server";
import { zodFieldError } from "@/lib/zodFieldError";
import { z } from "zod";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
import CatalogGame from "@/lib/models/CatalogGame";
import { editionUpdateSchema } from "@/lib/editionPayload";
import { requireAdminSession } from "@/lib/requireAdmin";
import { getEditionById, isVirtualId, parseSeedEditionId } from "@/lib/editions";
import { resolveInstallAction } from "@/lib/editionInstall";
import { requestDiscordProvision } from "@/lib/discordProvision";

/** A virtual edition has no document, so nothing can be read, edited or deleted by id. */
function virtualRejection() {
  return NextResponse.json(
    {
      error:
        "This game's Official edition is generated from the game itself and has no record to edit. Create a real edition for this game instead.",
    },
    { status: 400 }
  );
}

/** GET /api/editions/:id */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (isVirtualId(id)) return virtualRejection();

    const edition = await getEditionById(id);
    if (!edition || edition.visibility === "hidden") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      edition: { ...edition, installAction: resolveInstallAction(edition) },
    });
  } catch (err) {
    console.error("Get edition error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH /api/editions/:id — admin only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { id } = await params;
    if (isVirtualId(id)) return virtualRejection();

    const body = editionUpdateSchema.parse(await req.json());
    await dbConnect();

    /*
     * A seed-backed edition has no database row yet — it is served straight
     * from src/lib/data/editions.ts by loadStoredForGame. Saving one used to
     * 404, because findById cannot cast "seed:holocure:playbound", which left
     * every seed-only edition permanently uneditable in admin.
     *
     * Editing one materialises it instead: the row is created from what the
     * form submitted, and from then on it is an ordinary stored edition that
     * takes precedence over the seed entry of the same slug.
     */
    const seedRef = parseSeedEditionId(id);
    let existing = seedRef
      ? await EditionModel.findOne({ gameSlug: seedRef.gameSlug, slug: seedRef.slug })
      : await EditionModel.findById(id);

    if (!existing && seedRef) {
      const gameDoc = await CatalogGame.findOne({ slug: body.gameSlug })
        .select("_id")
        .lean();
      existing = new EditionModel({
        ...body,
        gameId: (gameDoc as { _id?: unknown } | null)?._id ?? null,
      });
    }

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Slug is unique per game, and the game itself can be reassigned, so both
    // sides of the pair have to be checked against the incoming values.
    const slugChanged = existing.slug !== body.slug || existing.gameSlug !== body.gameSlug;
    if (slugChanged) {
      const clash = await EditionModel.findOne({
        gameSlug: body.gameSlug,
        slug: body.slug,
        _id: { $ne: existing._id },
      }).lean();
      if (clash) {
        return NextResponse.json(
          { error: `That game already has an edition with the slug "${body.slug}".` },
          { status: 409 }
        );
      }
    }

    // Keep the ObjectId reference in step when an edition moves between games.
    let gameId = existing.gameId;
    if (existing.gameSlug !== body.gameSlug) {
      const gameDoc = await CatalogGame.findOne({ slug: body.gameSlug }).select("_id").lean();
      gameId = (gameDoc as { _id?: unknown } | null)?._id ?? null;
    }

    Object.assign(existing, body, { gameId });
    await existing.save();

    if (body.isDefault) {
      await EditionModel.updateMany(
        { gameSlug: body.gameSlug, _id: { $ne: existing._id } },
        { $set: { isDefault: false } }
      );
    }

    const parentDoc = await CatalogGame.findOne({ slug: existing.gameSlug })
      .select("published status")
      .lean();
    const parentPublished =
      parentDoc?.published === true || parentDoc?.status === "published";
    if (
      parentPublished &&
      existing.visibility === "public" &&
      existing.status === "active"
    ) {
      void requestDiscordProvision(existing.gameSlug);
    }

    return NextResponse.json({ success: true, id: String(existing._id), slug: existing.slug });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: zodFieldError(err) }, { status: 400 });
    }
    console.error("Update edition error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/editions/:id — admin only.
 *
 * Deleting the last edition of a game is allowed: the game simply falls back
 * to its synthesized Official edition, so nothing breaks. Deleting the default
 * promotes the next one so a game is never left without one.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { id } = await params;
    if (isVirtualId(id)) return virtualRejection();

    await dbConnect();
    const seedRef = parseSeedEditionId(id);
    if (seedRef) {
      const seedEdition = await getEditionById(id);
      if (!seedEdition) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const gameDoc = await CatalogGame.findOne({ slug: seedRef.gameSlug })
        .select("_id")
        .lean();

      /*
       * A static seed has no document to remove. Persist a hidden tombstone
       * with the same unique gameSlug/slug pair so every edition reader knows
       * not to merge that seed back in on the next request or deployment.
       */
      await EditionModel.findOneAndUpdate(
        { gameSlug: seedRef.gameSlug, slug: seedRef.slug },
        {
          $set: {
            gameId: (gameDoc as { _id?: unknown } | null)?._id ?? null,
            name: seedEdition.name,
            shortDescription: "",
            description: "",
            type: seedEdition.type,
            status: "archived",
            visibility: "hidden",
            sortOrder: seedEdition.sortOrder,
            isDefault: false,
            installMethod: "manual",
            installConfig: {},
            verified: false,
            verificationLevel: "deprecated",
            suppressesSeed: true,
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );

      return NextResponse.json({ success: true });
    }

    const doc = await EditionModel.findByIdAndDelete(id);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (doc.isDefault) {
      const next = await EditionModel.findOne({ gameSlug: doc.gameSlug }).sort({ sortOrder: 1, name: 1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete edition error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
