import { developerGamePayloadSchema } from "@/lib/developerGamePayload";

// Keep both database reads and API responses limited to the developer editor.
// The ownership fields are fetched solely for authorization and never returned.
const editableFields = developerGamePayloadSchema.keyof().options.filter((field) => field !== "communityLinks");
const editorialFields = ["slug", "title", "status", "qualityBar", "whyWePickedIt", "bestFor", "notFor"] as const;

export const DEVELOPER_GAME_SELECT = [
  ...editableFields,
  ...editorialFields,
  "ownerUserId",
  "developerSlug",
  "communityLinks.officialDiscord.inviteUrl",
  "communityLinks.officialDiscord.serverName",
].join(" ");

export function developerGameResponse(game: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const field of [...editableFields, ...editorialFields]) {
    if (Object.hasOwn(game, field)) result[field] = game[field];
  }
  const links = game.communityLinks as { officialDiscord?: { inviteUrl?: unknown; serverName?: unknown } | null } | null;
  if (links?.officialDiscord) {
    result.communityLinks = {
      officialDiscord: {
        inviteUrl: links.officialDiscord.inviteUrl ?? null,
        serverName: links.officialDiscord.serverName ?? null,
      },
    };
  }
  return result;
}
