import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
import CatalogGame from "@/lib/models/CatalogGame";
import { editions as seedEditions } from "@/lib/data/editions";
import { parseSeedEditionId } from "@/lib/editions";
import { editionReorderSchema } from "@/lib/editionPayload";
import { requireAdminSession } from "@/lib/requireAdmin";

/**
 * POST /api/admin/editions/reorder
 *
 * Persists edition display order for one game as a single pass, rather than
 * PATCHing each edition — reordering five editions should not be five
 * round trips, and a partial failure mid-list would leave a jumbled order.
 */
export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { gameSlug, order } = editionReorderSchema.parse(await req.json());
    await dbConnect();

    const owned = await EditionModel.find({ gameSlug }).select("_id isDefault").lean();
    const ownedIds = new Set(owned.map((d) => String((d as { _id: unknown })._id)));

    const seedBySlug = new Map(
      seedEditions.filter((seed) => seed.gameSlug === gameSlug).map((seed) => [seed.slug, seed])
    );
    const requested = order.map((id) => {
      if (ownedIds.has(id)) return { id };
      const ref = parseSeedEditionId(id);
      const seed = ref?.gameSlug === gameSlug ? seedBySlug.get(ref.slug) : undefined;
      return seed ? { id, seed } : null;
    });

    // Do not silently discard stale or cross-game ids. That previously let a
    // mixed database/seed list report success even though part of its order
    // had not been persisted.
    if (requested.some((item) => item === null)) {
      return NextResponse.json(
        { error: "One or more editions no longer belong to this game. Refresh and try again." },
        { status: 400 }
      );
    }
    const validRequests = requested.filter(
      (item): item is Exclude<(typeof requested)[number], null> => item !== null
    );

    const seedRequests = validRequests.filter(
      (item): item is { id: string; seed: (typeof seedEditions)[number] } => Boolean(item?.seed)
    );
    if (seedRequests.length > 0) {
      const game = await CatalogGame.findOne({ slug: gameSlug }).select("_id").lean();
      if (!game) {
        return NextResponse.json({ error: "The parent game no longer exists." }, { status: 400 });
      }

      let hasDefault = owned.some((edition) => Boolean(edition.isDefault));
      for (const { seed } of seedRequests) {
        const keepDefault = Boolean(seed.isDefault) && !hasDefault;
        await EditionModel.updateOne(
          { gameSlug, slug: seed.slug },
          {
            $setOnInsert: {
              ...seed,
              isDefault: keepDefault,
              gameId: (game as { _id: unknown })._id,
            },
          },
          { upsert: true }
        );
        if (keepDefault) hasDefault = true;
      }
    }

    await EditionModel.bulkWrite(
      validRequests.map((item, index) => ({
        updateOne: {
          filter: item.seed ? { gameSlug, slug: item.seed.slug } : { _id: item.id, gameSlug },
          update: { $set: { sortOrder: index } },
        },
      }))
    );

    return NextResponse.json({ success: true, reordered: validRequests.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Reorder editions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
