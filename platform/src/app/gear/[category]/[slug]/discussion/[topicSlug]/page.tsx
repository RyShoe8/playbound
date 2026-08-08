import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import type { Metadata } from "next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import DiscussionReply from "@/lib/models/DiscussionReply";
import Gear from "@/lib/models/Gear";
import { pageMetadata, privateMetadata } from "@/lib/seo";
import { TopicThread } from "@/components/discussion/TopicThread";
import { canAcceptSolution } from "@/lib/discussion/permissions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string; topicSlug: string }>;
}): Promise<Metadata> {
  const { slug, topicSlug, category } = await params;
  try {
    await dbConnect();
    const gear = await Gear.findOne({ slug, status: "published" }).select("title category").lean();
    if (!gear) return privateMetadata("Discussion");
    const topic = await DiscussionTopic.findOne({
      gearSlug: slug,
      slug: topicSlug,
      status: { $ne: "removed" },
    })
      .select("title")
      .lean();
    if (!topic) return privateMetadata("Discussion");
    const categoryPath = String(gear.category || category).toLowerCase();
    return pageMetadata({
      title: `${topic.title} · ${gear.title} discussion`,
      description: `Discussion about ${gear.title} on PlayBound.`,
      path: `/gear/${categoryPath}/${slug}/discussion/${topicSlug}`,
    });
  } catch {
    return privateMetadata("Discussion");
  }
}

export default async function GearDiscussionTopicPage({
  params,
}: {
  params: Promise<{ category: string; slug: string; topicSlug: string }>;
}) {
  const { slug, topicSlug, category } = await params;
  await dbConnect();

  const gear = await Gear.findOne({ slug, status: "published" }).lean();
  if (!gear) notFound();

  const session = await getServerSession(authOptions);

  const topic = await DiscussionTopic.findOne({
    gearSlug: slug,
    slug: topicSlug,
    status: { $ne: "removed" },
  }).lean();
  if (!topic) notFound();

  await DiscussionTopic.updateOne({ _id: topic._id }, { $inc: { viewCount: 1 } });

  const replies = await DiscussionReply.find({
    topicId: topic._id,
    status: { $ne: "removed" },
  })
    .sort({ createdAt: 1 })
    .lean();

  const accepted =
    topic.acceptedReplyId != null
      ? replies.find((r) => String(r._id) === String(topic.acceptedReplyId)) ?? null
      : replies.find((r) => r.isAcceptedSolution) ?? null;

  const categoryPath = String(gear.category || category).toLowerCase();

  const topicView = {
    _id: String(topic._id),
    gameSlug: topic.gameSlug ?? null,
    modSlug: topic.modSlug ?? null,
    gearSlug: topic.gearSlug ?? slug,
    gearCategory: categoryPath,
    slug: topic.slug,
    title: topic.title,
    body: topic.body,
    category: topic.category,
    tags: topic.tags ?? [],
    hasSpoilers: Boolean(topic.hasSpoilers),
    status: topic.status,
    isPinned: Boolean(topic.isPinned),
    isSolved: Boolean(topic.isSolved),
    acceptedReplyId: topic.acceptedReplyId ? String(topic.acceptedReplyId) : null,
    authorId: String(topic.authorId),
    authorUsername: topic.authorUsername,
    createdAt: topic.createdAt,
    replyCount: topic.replyCount,
    viewCount: topic.viewCount + 1,
  };

  const replyViews = replies.map((r) => ({
    _id: String(r._id),
    body: r.body,
    authorId: String(r.authorId),
    authorUsername: r.authorUsername,
    createdAt: r.createdAt,
    status: r.status,
    isAcceptedSolution: Boolean(r.isAcceptedSolution),
    quotedReplyId: r.quotedReplyId ? String(r.quotedReplyId) : null,
    replyToUsername: r.replyToUsername ?? null,
  }));

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <TopicThread
        gameTitle={gear.title}
        topic={topicView}
        replies={replyViews}
        accepted={accepted ? replyViews.find((r) => r._id === String(accepted._id)) ?? null : null}
        isSignedIn={Boolean(session?.user)}
        isAdmin={session?.user?.role === "admin"}
        canAccept={canAcceptSolution(session, topic)}
      />
    </div>
  );
}
