import type { Game } from "@/lib/data/types";
import {
  DISCUSSION_CATEGORIES,
  type DiscussionCategory,
} from "@/lib/models/DiscussionTopic";

export type CategoryMeta = {
  id: DiscussionCategory;
  label: string;
  shortLabel: string;
};

export const CATEGORY_META: Record<DiscussionCategory, CategoryMeta> = {
  general: { id: "general", label: "General", shortLabel: "General" },
  help: { id: "help", label: "Questions & Help", shortLabel: "Help" },
  technical: { id: "technical", label: "Installation & Technical", shortLabel: "Technical" },
  multiplayer: { id: "multiplayer", label: "Multiplayer & LFG", shortLabel: "Multiplayer" },
  servers: { id: "servers", label: "Servers", shortLabel: "Servers" },
  mods: { id: "mods", label: "Mods", shortLabel: "Mods" },
  guides: { id: "guides", label: "Guides & Tips", shortLabel: "Guides" },
  feedback: { id: "feedback", label: "Feedback", shortLabel: "Feedback" },
  announcements: { id: "announcements", label: "Announcements", shortLabel: "Announcements" },
};

function hasFeature(features: string[], needle: string): boolean {
  const n = needle.toLowerCase();
  return features.some((f) => f.toLowerCase().includes(n));
}

/** Categories visible for a game based on features / launch methods. */
export function visibleCategories(game: Pick<Game, "features" | "launchMethods">): CategoryMeta[] {
  const features = game.features ?? [];
  const always: DiscussionCategory[] = [
    "general",
    "help",
    "technical",
    "guides",
    "feedback",
    "announcements",
  ];
  const optional: DiscussionCategory[] = [];
  if (hasFeature(features, "multiplayer") || hasFeature(features, "co-op") || hasFeature(features, "hotseat")) {
    optional.push("multiplayer");
  }
  if (
    hasFeature(features, "dedicated servers") ||
    (game.launchMethods ?? []).includes("server")
  ) {
    optional.push("servers");
  }
  if (hasFeature(features, "mod")) {
    optional.push("mods");
  }
  const order = DISCUSSION_CATEGORIES.filter(
    (c) => always.includes(c) || optional.includes(c)
  );
  return order.map((id) => CATEGORY_META[id]);
}

export function isValidCategory(value: string): value is DiscussionCategory {
  return (DISCUSSION_CATEGORIES as readonly string[]).includes(value);
}

/** Categories that support marking a reply as the solution. */
export function categorySupportsSolved(category: DiscussionCategory): boolean {
  return category === "help" || category === "technical";
}
