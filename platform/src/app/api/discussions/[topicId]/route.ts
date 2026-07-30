import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import DiscussionReply from "@/lib/models/DiscussionReply";
import {
  canEditTopic,
  loadPosterGate,
} from "@/lib/discussion/permissions";
import { accountAllowsLinks, sanitizeTopicInput } from "@/lib/discussion/sanitize";

const patchSchema = z.object({
  title: z.string().min(3).max(150).optional(),
  body: z.string().min(5).max(10000).optional(),
  tags: z.array(z.string().max(24)).max(8).optional(),
  hasSpoilers: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const { topicId } = await params;
  await dbConnect();
  const topic = await DiscussionTopic.findById(topicId).lean();
  if (!topic || topic.status === "removed") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await DiscussionTopic.updateOne({ _id: topicId }, { $inc: { viewCount: 1 } });

  return NextResponse.json({ topic: { ...topic, viewCount: topic.viewCount + 1 } });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const { topicId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const raw = patchSchema.parse(await req.json());
    await dbConnect();
    const topic = await DiscussionTopic.findById(topicId);
    if (!topic || topic.status === "removed") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canEditTopic(session, topic)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const gate = await loadPosterGate(session.user.id);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    if (raw.title !== undefined || raw.body !== undefined) {
      const clean = sanitizeTopicInput({
        title: raw.title ?? topic.title,
        body: raw.body ?? topic.body,
        tags: raw.tags ?? topic.tags,
        allowLinks: accountAllowsLinks(gate.user.createdAt),
      });
      if (!clean.ok) {
        return NextResponse.json({ error: clean.error }, { status: 400 });
      }
      if (raw.title !== undefined) topic.title = clean.title!;
      if (raw.body !== undefined) topic.body = clean.body;
      if (raw.tags !== undefined) topic.tags = clean.tags;
    }
    if (raw.hasSpoilers !== undefined) topic.hasSpoilers = raw.hasSpoilers;
    await topic.save();

    revalidatePath(`/games/${topic.gameSlug}`);
    revalidatePath(`/games/${topic.gameSlug}/discussion/${topic.slug}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Discussion patch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const { topicId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  await dbConnect();
  const topic = await DiscussionTopic.findById(topicId);
  if (!topic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canEditTopic(session, topic) && session.user.role !== "admin") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  topic.status = "removed";
  await topic.save();
  await DiscussionReply.updateMany(
    { topicId: topic._id },
    { $set: { status: "removed" } }
  );

  revalidatePath(`/games/${topic.gameSlug}`);
  return NextResponse.json({ success: true });
}
