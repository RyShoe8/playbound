import { revalidatePath } from "next/cache";
import Gear from "@/lib/models/Gear";

type TopicLike = {
  gameSlug?: string | null;
  modSlug?: string | null;
  gearSlug?: string | null;
  slug: string;
};

/** Stable denormalized key for DiscussionReply.gameSlug (still required on that model). */
export function replyGameSlugKey(topic: TopicLike): string {
  if (topic.gearSlug) return `gear:${topic.gearSlug}`;
  if (topic.modSlug && topic.gameSlug) return topic.gameSlug;
  return topic.gameSlug || "unknown";
}

export async function revalidateDiscussionTopicPaths(topic: TopicLike) {
  if (topic.gearSlug) {
    await revalidateGearPaths(topic.gearSlug, topic.slug);
    return;
  }
  if (topic.modSlug) {
    revalidatePath(`/mods/${topic.modSlug}`);
    revalidatePath(`/mods/${topic.modSlug}/discussion/${topic.slug}`);
    return;
  }
  if (topic.gameSlug) {
    revalidatePath(`/games/${topic.gameSlug}`);
    revalidatePath(`/games/${topic.gameSlug}/discussion/${topic.slug}`);
  }
}

async function revalidateGearPaths(gearSlug: string, topicSlug: string) {
  const gear = await Gear.findOne({ slug: gearSlug }).select("category").lean();
  const category = String(gear?.category || "gear").toLowerCase();
  revalidatePath(`/gear/${category}/${gearSlug}`);
  revalidatePath(`/gear/${category}/${gearSlug}/discussion/${topicSlug}`);
}
