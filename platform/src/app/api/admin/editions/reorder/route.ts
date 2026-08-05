import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
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

    const owned = await EditionModel.find({ gameSlug }).select("_id").lean();
    const ownedIds = new Set(owned.map((d) => String((d as { _id: unknown })._id)));

    // Ignore ids that belong to another game (or no longer exist) so a stale
    // client cannot reorder editions it wasn't looking at.
    const valid = order.filter((id) => ownedIds.has(id));
    if (valid.length === 0) {
      return NextResponse.json({ error: "No editions matched that game." }, { status: 400 });
    }

    await EditionModel.bulkWrite(
      valid.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index } } },
      }))
    );

    return NextResponse.json({ success: true, reordered: valid.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Reorder editions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
