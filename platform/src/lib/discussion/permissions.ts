import type { Session } from "next-auth";
import User from "@/lib/models/User";
import ModeratorAuditLog from "@/lib/models/ModeratorAuditLog";
import type { DiscussionTopicDoc } from "@/lib/models/DiscussionTopic";
import type { DiscussionReplyDoc } from "@/lib/models/DiscussionReply";

export function isAdmin(session: Session | null): boolean {
  return session?.user?.role === "admin";
}

export async function loadPosterGate(userId: string): Promise<
  | {
      ok: true;
      user: {
        _id: unknown;
        emailVerified?: boolean;
        createdAt?: Date;
        community?: { suspendedUntil?: Date | null };
        disabled?: boolean;
      };
    }
  | { ok: false; error: string; status: number }
> {
  const user = await User.findById(userId)
    .select("emailVerified createdAt community disabled")
    .lean();
  if (!user || user.disabled) {
    return { ok: false, error: "Account unavailable.", status: 403 };
  }
  if (!user.emailVerified) {
    return {
      ok: false,
      error: "Verify your email before posting in discussions.",
      status: 403,
    };
  }
  const until = user.community?.suspendedUntil;
  if (until && new Date(until) > new Date()) {
    return {
      ok: false,
      error: `Your account is suspended from community posting until ${new Date(until).toISOString()}.`,
      status: 403,
    };
  }
  return { ok: true, user };
}

export function canModerate(session: Session | null): boolean {
  return isAdmin(session);
}

export function canEditTopic(
  session: Session | null,
  topic: Pick<DiscussionTopicDoc, "authorId" | "status">
): boolean {
  if (!session?.user) return false;
  if (canModerate(session)) return true;
  if (topic.status === "locked" || topic.status === "removed") return false;
  return String(topic.authorId) === session.user.id;
}

export function canEditReply(
  session: Session | null,
  reply: Pick<DiscussionReplyDoc, "authorId" | "status">,
  topicStatus: string
): boolean {
  if (!session?.user) return false;
  if (canModerate(session)) return true;
  if (topicStatus === "locked" || reply.status === "removed") return false;
  return String(reply.authorId) === session.user.id;
}

export function canAcceptSolution(
  session: Session | null,
  topic: Pick<DiscussionTopicDoc, "authorId">
): boolean {
  if (!session?.user) return false;
  if (canModerate(session)) return true;
  return String(topic.authorId) === session.user.id;
}

export async function writeAuditLog(input: {
  actorId: string;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string;
  note?: string;
  meta?: Record<string, unknown>;
}) {
  await ModeratorAuditLog.create({
    actorId: input.actorId,
    actorUsername: input.actorUsername,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    note: input.note ?? null,
    meta: input.meta ?? null,
  });
}
