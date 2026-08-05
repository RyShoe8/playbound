import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import { getGame } from "@/lib/catalog";
import { getEditionBySlug } from "@/lib/editions";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(3).max(120),
  body: z.string().min(40).max(4000),
  /**
   * Omitted for a review of the game as a whole, which is what every existing
   * client sends — so older callers keep working untouched.
   */
  editionSlug: z.string().trim().max(80).nullish(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) {
    return NextResponse.json({ error: "Unknown game" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to write a review" }, { status: 401 });
  }

  try {
    const { editionSlug: rawEdition, ...body } = reviewSchema.parse(await req.json());
    const editionSlug = rawEdition || null;

    // A review pinned to an edition that does not exist would be invisible on
    // both the game page and every edition page — reject rather than orphan it.
    let editionName: string | null = null;
    if (editionSlug) {
      const edition = await getEditionBySlug(game, editionSlug);
      if (!edition) {
        return NextResponse.json({ error: "Unknown edition" }, { status: 404 });
      }
      editionName = edition.name;
    }

    await dbConnect();

    const existing = await Review.findOne({
      gameSlug: slug,
      editionSlug,
      userId: session.user.id,
    });
    if (existing) {
      return NextResponse.json(
        {
          error: editionName
            ? `You've already reviewed the ${editionName} edition`
            : "You've already reviewed this game",
        },
        { status: 400 }
      );
    }

    await Review.create({
      gameSlug: slug,
      editionSlug,
      userId: session.user.id,
      username: session.user.username,
      ...body,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    // The pre-migration { gameSlug, userId } unique index is still in place on
    // databases where migrate:review-index has not run, so a second review on
    // a different edition surfaces as a duplicate key rather than as our own
    // check above. Say something actionable instead of a 500.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        {
          error:
            "This database still enforces one review per game. Run `npm run migrate:review-index -- --apply` to allow per-edition reviews.",
        },
        { status: 409 }
      );
    }
    console.error("Review creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
