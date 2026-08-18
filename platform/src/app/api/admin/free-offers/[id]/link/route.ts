import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import FreeOffer from "@/lib/models/FreeOffer";
import CatalogGame from "@/lib/models/CatalogGame";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { id } = await ctx.params;
  const { gameSlug } = z.object({ gameSlug: z.string().trim().min(1).max(80) }).parse(await req.json());
  await dbConnect();
  const game = await CatalogGame.findOne({ slug: gameSlug }).select("_id slug title").lean();
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
  const offer = await FreeOffer.findByIdAndUpdate(
    id,
    {
      $set: {
        gameId: game._id,
        gameSlug: game.slug,
        matchConfidence: "exact",
      },
    },
    { new: true }
  ).lean();
  if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  revalidateTag("free-offers", { expire: 0 });
  revalidateTag("catalog", { expire: 0 });
  return NextResponse.json({ ok: true, gameSlug: game.slug });
}
