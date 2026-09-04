import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { gameControlsSchema } from "@/lib/controls/schema";
import CatalogGame from "@/lib/models/CatalogGame";
import { requireAdminSession } from "@/lib/requireAdmin";
import { firstZodErrorMessage } from "@/lib/zodError";

/**
 * Controls are edited on their own, never as part of a whole-game submission.
 *
 * Same reasoning as the launcher-install route next door: a full-form PATCH
 * carries every field, so a stale copy of the form can quietly overwrite
 * editorial text that someone else changed in between. Documenting a keybind
 * has no business being able to do that. This $sets one path and reads back
 * only that path.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    const body = z
      .object({ controls: gameControlsSchema.nullable() })
      .parse(await req.json());

    await dbConnect();
    const doc = await CatalogGame.findOneAndUpdate(
      { slug },
      { $set: { controls: body.controls } },
      { returnDocument: "after", projection: { slug: 1, controls: 1 } }
    ).lean();

    if (!doc) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    revalidateTag("catalog", { expire: 0 });
    return NextResponse.json({ success: true, slug: doc.slug, controls: doc.controls });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 400 });
    }
    console.error("Admin controls update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Read the current block, so an editor can round-trip it without a full fetch. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    await dbConnect();
    const doc = await CatalogGame.findOne({ slug }, { slug: 1, controls: 1 }).lean();
    if (!doc) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    return NextResponse.json({ slug: doc.slug, controls: doc.controls ?? null });
  } catch (err) {
    console.error("Admin controls read error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
