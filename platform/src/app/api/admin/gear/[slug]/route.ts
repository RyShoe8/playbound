import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";
import GearRecommendation from "@/lib/models/GearRecommendation";
import Review from "@/lib/models/Review";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { slugifyTitle } from "@/lib/gamePayload";

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug: currentSlug } = await params;

  try {
    const data = await req.json();
    await dbConnect();

    const existing = await Gear.findOne({ slug: currentSlug });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rawNext =
      typeof data.slug === "string" && data.slug.trim()
        ? slugifyTitle(data.slug.trim())
        : currentSlug;
    const nextSlug = rawNext || currentSlug;

    if (nextSlug !== currentSlug) {
      const taken = await Gear.findOne({ slug: nextSlug }).select("_id").lean();
      if (taken) {
        return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
      }
    }

    const { slug: _ignore, ...rest } = data;
    Object.assign(existing, rest, { slug: nextSlug });
    await existing.save();

    if (nextSlug !== currentSlug) {
      await Promise.all([
        Review.updateMany({ gearSlug: currentSlug }, { $set: { gearSlug: nextSlug } }),
        DiscussionTopic.updateMany({ gearSlug: currentSlug }, { $set: { gearSlug: nextSlug } }),
        GearRecommendation.updateMany({ gearSlug: currentSlug }, { $set: { gearSlug: nextSlug } }),
      ]);
    }

    return NextResponse.json(existing);
  } catch (error: unknown) {
    console.error("Update gear failed:", error);
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: number }).code
        : undefined;
    if (code === 11000) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;

  try {
    await dbConnect();
    const gear = await Gear.findOneAndDelete({ slug });
    if (!gear) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete gear failed:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
