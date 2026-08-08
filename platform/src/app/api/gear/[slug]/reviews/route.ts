import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Review from "@/lib/models/Review";
import Gear from "@/lib/models/Gear";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(3).max(120),
  body: z.string().min(40).max(4000),
});

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await dbConnect();
  const gear = await Gear.findOne({ slug, status: "published" }).select("slug").lean();
  if (!gear) {
    return NextResponse.json({ error: "Unknown gear" }, { status: 404 });
  }

  const reviews = await Review.find({ gearSlug: slug }).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ reviews });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await dbConnect();
  const gear = await Gear.findOne({ slug, status: "published" }).select("slug").lean();
  if (!gear) {
    return NextResponse.json({ error: "Unknown gear" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to write a review" }, { status: 401 });
  }

  try {
    const body = reviewSchema.parse(await req.json());

    const existing = await Review.findOne({
      gearSlug: slug,
      userId: session.user.id,
    });
    if (existing) {
      return NextResponse.json({ error: "You've already reviewed this gear" }, { status: 400 });
    }

    await Review.create({
      gameSlug: null,
      editionSlug: null,
      modSlug: null,
      gearSlug: slug,
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
      return NextResponse.json({ error: "You've already reviewed this gear" }, { status: 409 });
    }
    console.error("Gear review creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
