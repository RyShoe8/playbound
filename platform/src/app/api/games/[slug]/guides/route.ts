import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import GuidePost from "@/lib/models/GuidePost";
import { getGame } from "@/lib/catalog";

const guideSchema = z.object({
  title: z.string().min(3).max(150),
  body: z.string().min(20).max(8000),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getGame(slug))) {
    return NextResponse.json({ error: "Unknown game" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to publish a guide" }, { status: 401 });
  }

  try {
    const body = guideSchema.parse(await req.json());
    await dbConnect();
    await GuidePost.create({
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
    console.error("Guide creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
