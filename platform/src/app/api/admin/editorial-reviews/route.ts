import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdminSession, requireAdminViewSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import EditorialReview from "@/lib/models/EditorialReview";
import { editorialReviewSchema } from "@/lib/editorialReviewPayload";
import { resolveEditorialTarget } from "@/lib/editorialReviewTarget";
import { ratingsTag } from "@/lib/ratingsData";

/** Every outlet review for one game, all targets and statuses, for the admin list. */
export async function GET(req: Request) {
  const { error } = await requireAdminViewSession();
  if (error) return error;
  const game = new URL(req.url).searchParams.get("game");
  await dbConnect();
  const filter = game ? { gameSlug: game } : {};
  const items = await EditorialReview.find(filter).sort({ gameSlug: 1, editionSlug: 1, createdAt: -1 }).limit(game ? 500 : 200).lean();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  try {
    const input = editorialReviewSchema.parse(await req.json());
    const target = await resolveEditorialTarget(input.gameSlug, input.editionSlug, { admin: true });
    if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });
    await dbConnect();
    const doc = await EditorialReview.create({ ...input, editionSlug: target.editionSlug, addedBy: session?.user?.id ?? null });
    revalidateTag(ratingsTag(input.gameSlug), { expire: 0 });
    return NextResponse.json({ success: true, id: String(doc._id) }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
    if ((err as { code?: number }).code === 11000) return NextResponse.json({ error: "That review link is already listed for this game or edition" }, { status: 409 });
    console.error("Editorial review create failed:", err);
    return NextResponse.json({ error: "Could not save the review" }, { status: 500 });
  }
}
