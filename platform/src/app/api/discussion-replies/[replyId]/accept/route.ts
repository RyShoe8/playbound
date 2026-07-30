import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscussionReply from "@/lib/models/DiscussionReply";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { canAcceptSolution } from "@/lib/discussion/permissions";
import { categorySupportsSolved } from "@/lib/discussion/categories";

export async function POST(
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
  if (!reply || reply.status === "removed") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const topic = await DiscussionTopic.findById(reply.topicId);
  if (!topic || topic.status === "removed") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canAcceptSolution(session, topic)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (!categorySupportsSolved(topic.category)) {
    return NextResponse.json(
      { error: "Only help and technical topics can mark a solution." },
      { status: 400 }
    );
  }

  await DiscussionReply.updateMany(
    { topicId: topic._id, isAcceptedSolution: true },
    { $set: { isAcceptedSolution: false } }
  );
  reply.isAcceptedSolution = true;
  await reply.save();

  topic.isSolved = true;
  topic.acceptedReplyId = reply._id;
  await topic.save();

  revalidatePath(`/games/${topic.gameSlug}/discussion/${topic.slug}`);
  return NextResponse.json({ success: true });
}
