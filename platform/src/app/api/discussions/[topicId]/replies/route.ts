import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import DiscussionReply from "@/lib/models/DiscussionReply";
import User from "@/lib/models/User";
import { loadPosterGate } from "@/lib/discussion/permissions";
import { assertReplyRateLimit } from "@/lib/discussion/rateLimit";
import { accountAllowsLinks, sanitizeReplyInput } from "@/lib/discussion/sanitize";

const createSchema = z.object({
  body: z.string().min(5).max(10000),
  quotedReplyId: z.string().optional().nullable(),
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

  const replies = await DiscussionReply.find({
    topicId,
    status: { $ne: "removed" },
  })
    .sort({ createdAt: 1 })
    .lean();

  return NextResponse.json({ replies });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const { topicId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to reply" }, { status: 401 });
  }

  try {
    const raw = createSchema.parse(await req.json());
    await dbConnect();
    const topic = await DiscussionTopic.findById(topicId);
    if (!topic || topic.status === "removed") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (topic.status === "locked") {
      return NextResponse.json({ error: "This discussion is locked." }, { status: 403 });
    }

    const gate = await loadPosterGate(session.user.id);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const rate = await assertReplyRateLimit(session.user.id, gate.user.createdAt);
    if (!rate.ok) {
      return NextResponse.json({ error: rate.error }, { status: 429 });
    }

    const clean = sanitizeReplyInput({
      body: raw.body,
      allowLinks: accountAllowsLinks(gate.user.createdAt),
    });
    if (!clean.ok) {
      return NextResponse.json({ error: clean.error }, { status: 400 });
    }

    let replyToUserId = null;
    let replyToUsername = null;
    let quotedReplyId = null;
    if (raw.quotedReplyId) {
      const quoted = await DiscussionReply.findById(raw.quotedReplyId).lean();
      if (quoted && String(quoted.topicId) === topicId && quoted.status !== "removed") {
        quotedReplyId = quoted._id;
        replyToUserId = quoted.authorId;
        replyToUsername = quoted.authorUsername;
      }
    }

    const reply = await DiscussionReply.create({
      topicId: topic._id,
      gameSlug: topic.gameSlug,
      authorId: session.user.id,
      authorUsername: session.user.username,
      body: clean.body,
      quotedReplyId,
      replyToUserId,
      replyToUsername,
    });

    const isNewParticipant =
      String(topic.authorId) !== session.user.id &&
      !(await DiscussionReply.exists({
        topicId: topic._id,
        authorId: session.user.id,
        _id: { $ne: reply._id },
      }));

    topic.replyCount += 1;
    topic.lastReplyAt = reply.createdAt;
    topic.lastReplyUserId = reply.authorId;
    topic.lastReplyUsername = reply.authorUsername;
    if (isNewParticipant) topic.participantCount += 1;
    await topic.save();

    await User.updateOne(
      { _id: session.user.id },
      { $inc: { "community.replyCount": 1 } }
    );

    revalidatePath(`/games/${topic.gameSlug}`);
    revalidatePath(`/games/${topic.gameSlug}/discussion/${topic.slug}`);

    return NextResponse.json({ success: true, replyId: String(reply._id) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Reply create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
