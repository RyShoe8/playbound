import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscussionReaction from "@/lib/models/DiscussionReaction";
import DiscussionReply from "@/lib/models/DiscussionReply";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import User from "@/lib/models/User";
import { loadPosterGate } from "@/lib/discussion/permissions";

const schema = z.object({
  targetType: z.enum(["topic", "reply"]),
  targetId: z.string().min(1),
  reaction: z.literal("helpful").default("helpful"),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const raw = schema.parse(await req.json());
    await dbConnect();
    const gate = await loadPosterGate(session.user.id);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    if (raw.targetType === "topic") {
      const topic = await DiscussionTopic.findById(raw.targetId).lean();
      if (!topic || topic.status === "removed") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else {
      const reply = await DiscussionReply.findById(raw.targetId).lean();
      if (!reply || reply.status === "removed") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    try {
      await DiscussionReaction.create({
        userId: session.user.id,
        targetType: raw.targetType,
        targetId: raw.targetId,
        reaction: "helpful",
      });
    } catch {
      return NextResponse.json({ error: "Already reacted" }, { status: 409 });
    }

    if (raw.targetType === "reply") {
      const reply = await DiscussionReply.findById(raw.targetId).lean();
      if (reply) {
        await User.updateOne(
          { _id: reply.authorId },
          { $inc: { "community.helpfulCount": 1 } }
        );
      }
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Reaction error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
