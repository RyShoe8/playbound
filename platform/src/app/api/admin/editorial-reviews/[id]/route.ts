import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import EditorialReview from "@/lib/models/EditorialReview";
import { editorialReviewSchema } from "@/lib/editorialReviewPayload";
import { resolveEditorialTarget } from "@/lib/editorialReviewTarget";
import { ratingsTag } from "@/lib/ratingsData";

type Ctx = { params: Promise<{ id: string }> };

/** Replace one review with the full payload (the edit form sends every field). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const input = editorialReviewSchema.parse(await req.json());
    const target = await resolveEditorialTarget(input.gameSlug, input.editionSlug, { admin: true });
    if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });
    await dbConnect();
    const before = await EditorialReview.findById(id).select("gameSlug").lean<{ gameSlug: string }>();
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // An admin edit takes the row over: the automated sync never rewrites manual rows.
    await EditorialReview.updateOne(
      { _id: id },
      { $set: { ...input, editionSlug: target.editionSlug, source: "manual" } },
      { runValidators: true }
    );
    revalidateTag(ratingsTag(before.gameSlug), { expire: 0 });
    if (before.gameSlug !== input.gameSlug) revalidateTag(ratingsTag(input.gameSlug), { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
    if ((err as { code?: number }).code === 11000) return NextResponse.json({ error: "That review link is already listed for this game or edition" }, { status: 409 });
    console.error("Editorial review update failed:", err);
    return NextResponse.json({ error: "Could not save the review" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await dbConnect();
  const doc = await EditorialReview.findById(id).select("gameSlug source").lean<{ gameSlug: string; source?: string }>();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The sync would re-add a deleted automated row on its next pass; hiding it
  // keeps the row as a "no" that the sync respects.
  if (doc.source && doc.source !== "manual") {
    await EditorialReview.updateOne({ _id: id }, { $set: { status: "hidden" } });
  } else {
    await EditorialReview.deleteOne({ _id: id });
  }
  revalidateTag(ratingsTag(doc.gameSlug), { expire: 0 });
  return NextResponse.json({ success: true, hidden: Boolean(doc.source && doc.source !== "manual") });
}
