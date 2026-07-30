import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscussionReply from "@/lib/models/DiscussionReply";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import {
  canEditReply,
  loadPosterGate,
} from "@/lib/discussion/permissions";
import { accountAllowsLinks, sanitizeReplyInput } from "@/lib/discussion/sanitize";

const patchSchema = z.object({
  body: z.string().min(5).max(10000),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ replyId: string }> }
) {
  const { replyId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const raw = patchSchema.parse(await req.json());
    await dbConnect();
    const reply = await DiscussionReply.findById(replyId);
    if (!reply || reply.status === "removed") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const topic = await DiscussionTopic.findById(reply.topicId);
    if (!topic || topic.status === "removed") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canEditReply(session, reply, topic.status)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const gate = await loadPosterGate(session.user.id);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const clean = sanitizeReplyInput({
      body: raw.body,
      allowLinks: accountAllowsLinks(gate.user.createdAt),
    });
    if (!clean.ok) {
      return NextResponse.json({ error: clean.error }, { status: 400 });
    }

    reply.editHistory = [
      ...(reply.editHistory ?? []),
      { body: reply.body, editedAt: new Date() },
    ];
    reply.body = clean.body;
    reply.status = "edited";
    await reply.save();

    revalidatePath(`/games/${topic.gameSlug}/discussion/${topic.slug}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Reply patch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ replyId: string }> }
) {
  const { replyId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  await dbConnect();
  const reply = await DiscussionReply.findById(replyId);
  if (!reply) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const topic = await DiscussionTopic.findById(reply.topicId);
  if (!topic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canEditReply(session, reply, topic.status) && session.user.role !== "admin") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  reply.status = "removed";
  await reply.save();
  if (topic.replyCount > 0) {
    topic.replyCount -= 1;
    await topic.save();
  }

  revalidatePath(`/games/${topic.gameSlug}/discussion/${topic.slug}`);
  return NextResponse.json({ success: true });
}
