/**
 * One-shot: migrate flat DiscussionPost documents into DiscussionTopic threads.
 * Safe to re-run — skips posts whose title+gameSlug already exist as topics.
 */
import dbConnect from "@/lib/db";
import DiscussionPost from "@/lib/models/DiscussionPost";
import DiscussionTopic from "@/lib/models/DiscussionTopic";
import { uniqueTopicSlug } from "@/lib/discussion/slugify";

async function main() {
  await dbConnect();
  const posts = await DiscussionPost.find().sort({ createdAt: 1 }).lean();
  let migrated = 0;
  let skipped = 0;

  for (const post of posts) {
    const existing = await DiscussionTopic.findOne({
      gameSlug: post.gameSlug,
      authorId: post.userId,
      title: post.title,
      createdAt: post.createdAt,
    }).lean();
    if (existing) {
      skipped++;
      continue;
    }

    const slug = await uniqueTopicSlug(post.gameSlug, post.title, async (s) => {
      const hit = await DiscussionTopic.exists({ gameSlug: post.gameSlug, slug: s });
      return Boolean(hit);
    });

    await DiscussionTopic.create({
      gameSlug: post.gameSlug,
      authorId: post.userId,
      authorUsername: post.username,
      title: post.title,
      slug,
      body: post.body,
      category: "general",
      tags: [],
      status: "open",
      isPinned: false,
      isSolved: false,
      replyCount: 0,
      viewCount: 0,
      participantCount: 1,
      lastReplyAt: post.createdAt,
      createdAt: post.createdAt,
      updatedAt: post.createdAt,
    });
    migrated++;
  }

  console.log(`Migrated ${migrated} discussion posts; skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
