import { IS_PRODUCTION, SITE_URL } from "@/lib/site";

/**
 * Fire-and-forget Discord channel provisioning via the Render bot worker.
 * No-ops when webhook env is unset so local/preview deploys stay quiet.
 */

const TIMEOUT_MS = 12_000;

let warnedMissing = false;

function webhookConfig(): { base: string; secret: string } | null {
  const base = process.env.DISCORD_BOT_WEBHOOK_URL?.replace(/\/$/, "");
  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (!base || !secret) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        "[discordProvision] DISCORD_BOT_WEBHOOK_URL / BOT_WEBHOOK_SECRET unset — skipping"
      );
    }
    return null;
  }
  return { base, secret };
}

async function postBot(path: string, body: Record<string, unknown>): Promise<unknown> {
  const cfg = webhookConfig();
  if (!cfg) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${cfg.secret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        typeof data === "string" ? data : data?.error || `Bot returned ${res.status}`
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Provision (or link) a single published game's Discord channel. */
export async function requestDiscordProvision(slug: string): Promise<void> {
  if (!slug) return;
  try {
    await postBot("/provision", { slug });
  } catch (err) {
    console.error(`[discordProvision] ${slug}:`, err instanceof Error ? err.message : err);
  }
}

/** Backfill all published games missing a PlayBound Discord channel. */
export async function requestDiscordProvisionAll(): Promise<unknown> {
  return postBot("/provision-all", {});
}

/**
 * Repair drift between game slugs/titles and existing Discord channels.
 *
 * Renames and re-parents channels, and moves unpublished games' channels into
 * an archive category. Never deletes and never creates — pass dryRun to get
 * the same report with nothing applied.
 */
export async function requestDiscordReconcile(
  opts?: { dryRun?: boolean }
): Promise<unknown> {
  return postBot("/reconcile", { dryRun: Boolean(opts?.dryRun) });
}

/** True when the game already has a PlayBound Discord channel id stored. */
export function hasPlayboundDiscordChannel(doc: {
  communityLinks?: { playboundDiscord?: { channelId?: string | null } | null } | null;
}): boolean {
  return Boolean(doc.communityLinks?.playboundDiscord?.channelId);
}

function absoluteCatalogMedia(url?: string | null): string | null {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${SITE_URL}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

/**
 * Tell the Discord bot to post in server #general. Production only —
 * preview/local must not announce even if the bot webhook env is set.
 */
export async function requestNewGameDiscordAnnounce(game: {
  slug: string;
  title: string;
  description?: string | null;
  tagline?: string | null;
  coverImage?: string | null;
  screenshots?: string[] | null;
}): Promise<void> {
  if (!IS_PRODUCTION || !game.slug) return;
  const description = (game.description || game.tagline || "").trim().slice(0, 2000);
  const imageUrl =
    absoluteCatalogMedia(game.screenshots?.find((u) => u?.trim()) || null) ||
    absoluteCatalogMedia(game.coverImage);
  try {
    await postBot("/announce-game", {
      slug: game.slug,
      title: game.title,
      description,
      url: `${SITE_URL}/games/${encodeURIComponent(game.slug)}`,
      imageUrl,
    });
  } catch (err) {
    console.error(
      `[discordAnnounce] ${game.slug}:`,
      err instanceof Error ? err.message : err
    );
  }
}
