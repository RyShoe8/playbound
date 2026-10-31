import { IS_PRODUCTION, SITE_URL } from "@/lib/site";

/**
 * Fire-and-forget Discord channel provisioning via the Render bot worker.
 * No-ops when webhook env is unset so local/preview deploys stay quiet.
 */

const TIMEOUT_MS = 12_000;
/**
 * The bot runs as a worker that can be spun down when idle, so the first request
 * after a quiet spell may take longer than twelve seconds just to wake it. That
 * request was being abandoned — Hydorah was published, the channel call and the
 * announcement both timed out, and nothing retried either. Calls that must land
 * (provision, announce) wait longer and try once more after a timeout, which
 * finds the worker awake.
 */
const PATIENT_TIMEOUT_MS = 30_000;
const RECONCILE_TIMEOUT_MS = 240_000;

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

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || /aborted|timeout/i.test(err.message));
}

async function postBot(
  path: string,
  body: Record<string, unknown>,
  opts: { patient?: boolean } = {}
): Promise<unknown> {
  if (opts.patient) {
    try {
      return await postBotOnce(path, body, PATIENT_TIMEOUT_MS);
    } catch (err) {
      // A timeout is the cold-start signature; any other failure is real.
      if (!isAbort(err)) throw err;
      return postBotOnce(path, body, PATIENT_TIMEOUT_MS);
    }
  }
  return postBotOnce(path, body, TIMEOUT_MS);
}

async function postBotOnce(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const cfg = webhookConfig();
  if (!cfg) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
export async function requestDiscordProvision(slug: string): Promise<unknown> {
  if (!slug) return null;
  try {
    const res = await postBot("/provision", { slug }, { patient: true });
    if (res) console.log(`[discordProvision] ${slug}: channel provisioned successfully`);
    return res;
  } catch (err) {
    console.error(`[discordProvision] ${slug}:`, err instanceof Error ? err.message : err);
    return null;
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
  opts: { dryRun?: boolean } = {}
): Promise<unknown> {
  // The bot answers only after walking every channel with rate-limit pauses,
  // which takes far longer than the 12s default; the cron has 300s.
  return postBotOnce("/reconcile", { dryRun: Boolean(opts.dryRun) }, RECONCILE_TIMEOUT_MS);
}

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
 *
 * One embed only: hero image + thatOneThing + title linking to the game page.
 */
export async function requestNewGameDiscordAnnounce(game: {
  slug: string;
  title: string;
  thatOneThing?: string | null;
  tagline?: string | null;
  coverImage?: string | null;
  screenshots?: string[] | null;
  publicationAt?: Date | string | null;
}): Promise<boolean> {
  if (!IS_PRODUCTION || !game.slug) return false;
  const thatOneThing = (game.thatOneThing || game.tagline || "").trim().slice(0, 2000);
  const imageUrl =
    absoluteCatalogMedia(game.coverImage) ||
    absoluteCatalogMedia(game.screenshots?.find((u) => u?.trim()) || null);
  try {
    const result = await postBot(
      "/announce-game",
      {
        slug: game.slug,
        title: game.title,
        thatOneThing,
        url: `${SITE_URL}/games/${encodeURIComponent(game.slug)}`,
        imageUrl,
        publicationAt: game.publicationAt ? new Date(game.publicationAt).toISOString() : null,
      },
      { patient: true }
    );
    return Boolean(result);
  } catch (err) {
    console.error(
      `[discordAnnounce] ${game.slug}:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}
