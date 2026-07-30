import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { writeAuditLog } from "@/lib/discussion/permissions";

const schema = z.object({
  action: z.enum(["pin", "unpin", "lock", "unlock", "remove", "restore", "archive"]),
  note: z.string().max(2000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;
  try {
    const raw = schema.parse(await req.json());
    await dbConnect();
    const topic = await DiscussionTopic.findById(id);
    if (!topic) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    switch (raw.action) {
      case "pin":
        topic.isPinned = true;
        break;
      case "unpin":
        topic.isPinned = false;
        break;
      case "lock":
        topic.status = "locked";
        break;
      case "unlock":
        if (topic.status === "locked") topic.status = "open";
        break;
      case "remove":
        topic.status = "removed";
        break;
      case "restore":
        topic.status = "open";
        break;
      case "archive":
        topic.status = "archived";
        break;
    }
    await topic.save();

    await writeAuditLog({
      actorId: session.user.id,
      actorUsername: session.user.username,
      action: raw.action,
      targetType: "topic",
      targetId: String(topic._id),
      note: raw.note,
    });

    revalidatePath(`/games/${topic.gameSlug}`);
    revalidatePath(`/games/${topic.gameSlug}/discussion/${topic.slug}`);
    return NextResponse.json({ success: true, status: topic.status, isPinned: topic.isPinned });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    console.error("Moderate topic error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
