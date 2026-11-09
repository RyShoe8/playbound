import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdminSession, requireAdminViewSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import EditorialReviewSource from "@/lib/models/EditorialReviewSource";
import { syncEditorialReviews } from "@/lib/editorialReviews/sync";
import { allSyncTargets } from "@/lib/editorialReviews/targets";
import { ratingsTag } from "@/lib/ratingsData";

export const maxDuration = 60;

/** Sync state for one game and its editions. */
export async function GET(req: Request) {
  const { error } = await requireAdminViewSession();
  if (error) return error;
  const game = new URL(req.url).searchParams.get("game");
  if (!game) return NextResponse.json({ error: "game is required" }, { status: 400 });
  await dbConnect();
  const sources = await EditorialReviewSource.find({ gameSlug: game }).lean();
  return NextResponse.json({ sources });
}

/** "Sync now" for one game: the base game and every stored edition. */
export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { gameSlug } = z.object({ gameSlug: z.string().trim().min(1).max(120) }).parse(await req.json());
  const targets = await allSyncTargets({ gameSlug });
  if (targets.length === 0) return NextResponse.json({ error: "Unknown game" }, { status: 404 });
  const snippetBudget = { left: 25 };
  const results = [];
  for (const target of targets) results.push(await syncEditorialReviews(target, { snippetBudget }));
  revalidateTag(ratingsTag(gameSlug), { expire: 0 });
  return NextResponse.json({ results });
}

const sourceSchema = z.object({
  gameSlug: z.string().trim().min(1).max(120),
  editionSlug: z.union([z.string().trim().max(80), z.null()]).optional().transform((v) => v || null),
  wikipediaTitle: z.union([z.string().trim().max(300), z.null()]).optional().transform((v) => v || null),
  disabled: z.boolean().optional().default(false),
});

/** Pin the Wikipedia article for a target, or switch its sync off. */
export async function PUT(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const input = sourceSchema.parse(await req.json());
  await dbConnect();
  await EditorialReviewSource.updateOne(
    { gameSlug: input.gameSlug, editionSlug: input.editionSlug },
    { $set: { wikipediaTitle: input.wikipediaTitle, disabled: input.disabled }, $setOnInsert: { gameSlug: input.gameSlug, editionSlug: input.editionSlug } },
    { upsert: true }
  );
  return NextResponse.json({ success: true });
}
