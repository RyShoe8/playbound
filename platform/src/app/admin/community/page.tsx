import type { Metadata } from "next";
import Link from "next/link";
import dbConnect from "@/lib/db";
import ContentReport from "@/lib/models/ContentReport";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import ModeratorAuditLog from "@/lib/models/ModeratorAuditLog";
import User from "@/lib/models/User";
import { AdminCommunityClient } from "@/components/admin/AdminCommunityClient";

export const metadata: Metadata = {
  title: "Admin · Community",
  robots: { index: false, follow: false },
};

export default async function AdminCommunityPage() {
  await dbConnect();
  const [openReports, removedTopics, lockedTopics, suspended, audit] = await Promise.all([
    ContentReport.find({ status: "open" }).sort({ createdAt: -1 }).limit(50).lean(),
    DiscussionTopic.find({ status: "removed" }).sort({ updatedAt: -1 }).limit(30).lean(),
    DiscussionTopic.find({ status: "locked" }).sort({ updatedAt: -1 }).limit(30).lean(),
    User.find({ "community.suspendedUntil": { $gt: new Date() } })
      .select("username email community")
      .limit(50)
      .lean(),
    ModeratorAuditLog.find().sort({ createdAt: -1 }).limit(40).lean(),
  ]);

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Community moderation</h1>
        <p className="mt-1 text-muted-foreground">
          Reports, removals, locks, suspensions, and audit log.{" "}
          <Link href="/admin/users" className="font-semibold text-primary hover:underline">
            Manage users
          </Link>
        </p>
      </div>
      <AdminCommunityClient
        reports={openReports.map((r) => ({
          id: String(r._id),
          targetType: r.targetType,
          targetId: String(r.targetId),
          reason: r.reason,
          details: r.details ?? null,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
        removed={removedTopics.map((t) => ({
          id: String(t._id),
          title: t.title,
          gameSlug: t.gameSlug,
          slug: t.slug,
          status: t.status,
        }))}
        locked={lockedTopics.map((t) => ({
          id: String(t._id),
          title: t.title,
          gameSlug: t.gameSlug,
          slug: t.slug,
          status: t.status,
        }))}
        suspended={suspended.map((u) => ({
          id: String(u._id),
          username: u.username,
          email: u.email,
          until: u.community?.suspendedUntil
            ? new Date(u.community.suspendedUntil).toISOString()
            : null,
        }))}
        audit={audit.map((a) => ({
          id: String(a._id),
          actorUsername: a.actorUsername,
          action: a.action,
          targetType: a.targetType,
          targetId: String(a.targetId),
          note: a.note ?? null,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
