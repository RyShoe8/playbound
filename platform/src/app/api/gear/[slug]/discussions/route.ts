import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import {
  DISCUSSION_CATEGORIES,
  CATEGORY_META,
  isValidCategory,
} from "@/lib/discussion/categories";
import User from "@/lib/models/User";
import Gear from "@/lib/models/Gear";
import { loadPosterGate } from "@/lib/discussion/permissions";
import { assertTopicRateLimit } from "@/lib/discussion/rateLimit";
import { accountAllowsLinks, sanitizeTopicInput } from "@/lib/discussion/sanitize";
import { uniqueTopicSlug } from "@/lib/discussion/slugify";
import { recaptchaErrorMessage, verifyRecaptcha } from "@/lib/recaptcha";
import { gearScopedUgcFilter } from "@/lib/ugcTarget";

const GEAR_CATEGORIES = DISCUSSION_CATEGORIES.filter((c) =>
  ["general", "help", "technical", "guides", "feedback", "announcements"].includes(c)
).map((id) => CATEGORY_META[id]);

const createSchema = z.object({
  title: z.string().min(3).max(150),
  body: z.string().min(5).max(10000),
  category: z.enum(DISCUSSION_CATEGORIES),
  tags: z.array(z.string().max(24)).max(8).optional(),
  hasSpoilers: z.boolean().optional(),
  recaptchaToken: z.string().optional(),
});

async function loadPublishedGear(slug: string) {
  await dbConnect();
  return Gear.findOne({ slug, status: "published" }).lean();
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gear = await loadPublishedGear(slug);
  if (!gear) {
    return NextResponse.json({ error: "Unknown gear" }, { status: 404 });
  }

  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q")?.trim() ?? "";
  const sort = url.searchParams.get("sort") ?? "activity";
  const filter = url.searchParams.get("filter") ?? "all";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));

  const query: Record<string, unknown> = {
    ...gearScopedUgcFilter(slug),
    status: { $ne: "removed" },
  };

  if (category && category !== "all" && isValidCategory(category)) {
    query.category = category;
  }

  if (filter === "unanswered") {
    query.replyCount = 0;
    query.isSolved = false;
  } else if (filter === "solved") {
    query.isSolved = true;
  } else if (filter === "pinned") {
    query.isPinned = true;
  }

  if (q) {
    query.$text = { $search: q };
  }

  let sortSpec: Record<string, 1 | -1> = { isPinned: -1, lastReplyAt: -1, createdAt: -1 };
  if (sort === "newest") sortSpec = { isPinned: -1, createdAt: -1 };
  else if (sort === "replies") sortSpec = { isPinned: -1, replyCount: -1, lastReplyAt: -1 };
  else if (sort === "unanswered") sortSpec = { replyCount: 1, createdAt: -1 };

  const topics = await DiscussionTopic.find(query).sort(sortSpec).limit(limit).lean();

  return NextResponse.json({ topics, categories: GEAR_CATEGORIES });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gear = await loadPublishedGear(slug);
  if (!gear) {
    return NextResponse.json({ error: "Unknown gear" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to start a discussion" }, { status: 401 });
  }

  try {
    const raw = createSchema.parse(await req.json());
    const allowed = GEAR_CATEGORIES.map((c) => c.id);
    if (!allowed.includes(raw.category)) {
      return NextResponse.json({ error: "Category not available for this product." }, { status: 400 });
    }

    const captcha = await verifyRecaptcha(raw.recaptchaToken, "discussion_topic");
    if (!captcha.ok) {
      return NextResponse.json({ error: recaptchaErrorMessage(captcha.reason) }, { status: 400 });
    }

    await dbConnect();
    const gate = await loadPosterGate(session.user.id);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const rate = await assertTopicRateLimit(session.user.id, gate.user.createdAt);
    if (!rate.ok) {
      return NextResponse.json({ error: rate.error }, { status: 429 });
    }

    const clean = sanitizeTopicInput({
      title: raw.title,
      body: raw.body,
      tags: raw.tags,
      allowLinks: accountAllowsLinks(gate.user.createdAt),
    });
    if (!clean.ok) {
      return NextResponse.json({ error: clean.error }, { status: 400 });
    }

    const categorySlug = String(gear.category || "gear").toLowerCase();
    const topicSlug = await uniqueTopicSlug(slug, clean.title!, async (s) => {
      const hit = await DiscussionTopic.exists({ gearSlug: slug, slug: s });
      return Boolean(hit);
    });

    const now = new Date();
    const topic = await DiscussionTopic.create({
      gameSlug: null,
      modSlug: null,
      editionSlug: null,
      gearSlug: slug,
      authorId: session.user.id,
      authorUsername: session.user.username,
      title: clean.title,
      slug: topicSlug,
      body: clean.body,
      category: raw.category,
      tags: clean.tags,
      hasSpoilers: Boolean(raw.hasSpoilers),
      status: "open",
      lastReplyAt: now,
      participantCount: 1,
    });

    await User.updateOne({ _id: session.user.id }, { $inc: { "community.topicCount": 1 } });

    revalidatePath(`/gear/${categorySlug}/${slug}`);
    revalidatePath(`/gear/${categorySlug}/${slug}/discussion/${topicSlug}`);

    return NextResponse.json(
      {
        success: true,
        topic: {
          id: String(topic._id),
          slug: topic.slug,
          href: `/gear/${categorySlug}/${slug}/discussion/${topic.slug}`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Gear discussion create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
