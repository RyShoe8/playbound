import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import { getMod } from "@/lib/mods";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(3).max(120),
  body: z.string().min(40).max(4000),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mod = await getMod(slug);
  if (!mod) {
    return NextResponse.json({ error: "Unknown mod" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to write a review" }, { status: 401 });
  }

  try {
    const body = reviewSchema.parse(await req.json());
    await dbConnect();

    const existing = await Review.findOne({
      modSlug: slug,
      userId: session.user.id,
    });
    if (existing) {
      return NextResponse.json({ error: "You've already reviewed this mod" }, { status: 400 });
    }

    await Review.create({
      gameSlug: mod.baseGameSlug,
      editionSlug: null,
      modSlug: slug,
      userId: session.user.id,
      username: session.user.username,
      ...body,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json({ error: "You've already reviewed this mod" }, { status: 409 });
    }
    console.error("Mod review creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
