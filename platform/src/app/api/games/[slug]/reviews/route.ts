import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import { getGame } from "@/lib/catalog";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(3).max(120),
  body: z.string().min(40).max(4000),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getGame(slug))) {
    return NextResponse.json({ error: "Unknown game" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to write a review" }, { status: 401 });
  }

  try {
    const body = reviewSchema.parse(await req.json());
    await dbConnect();

    const existing = await Review.findOne({ gameSlug: slug, userId: session.user.id });
    if (existing) {
      return NextResponse.json({ error: "You've already reviewed this game" }, { status: 400 });
    }

    await Review.create({
      gameSlug: slug,
      userId: session.user.id,
      username: session.user.username,
      ...body,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Review creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
