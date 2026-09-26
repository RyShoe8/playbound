import dbConnect from "@/lib/db";
import CommunityServer from "@/lib/models/CommunityServer";
import { getHostableGame } from "@/lib/gameHost/catalog";

/** What a customer (or the public page) sees of a saved server. No host internals beyond the join address. */
export function customerServerView(s: Record<string, unknown>) {
  return {
    id: String(s._id),
    slug: String(s.slug),
    name: String(s.name),
    description: String(s.description || ""),
    visibility: String(s.visibility || "public"),
    gameSlug: String(s.gameSlug),
    gameTitle: getHostableGame(String(s.gameSlug))?.title || String(s.gameSlug),
    editionSlug: (s.editionSlug as string | null) || null,
    profileKey: String(s.profileKey),
    slots: Number(s.allocatedSlots) || 0,
    online: s.desiredState === "running",
    runtimeState: String(s.runtimeState || "stopped"),
    health: String(s.health || "unknown"),
    players: typeof s.playerCount === "number" ? s.playerCount : null,
    host: (s.host as string | null) || null,
    port: typeof s.port === "number" ? s.port : null,
    onlineSince: s.onlineSince ? new Date(s.onlineSince as string).toISOString() : null,
    statusReason: (s.decisionReason as string | null) || null,
  };
}

/**
 * A customer server as its public page shows it — or null when it has no
 * public page: missing, not a customer server, or private. Unlisted servers
 * have a page (that is how their link works) but are not indexed.
 */
export async function loadPublicServer(gameSlug: string, slug: string) {
  await dbConnect();
  const s = await CommunityServer.findOne({ ownerType: "user", gameSlug, slug }).lean();
  if (!s || s.visibility === "private") return null;
  const view = customerServerView(s as Record<string, unknown>);
  return {
    ...view,
    running: s.desiredState === "running" && s.runtimeState === "running" && Boolean(s.host && s.port),
    currentMap: (s.currentMap as string | null) || null,
    regionKey: String(s.regionKey),
    listed: s.visibility === "public",
  };
}
