import dbConnect from "@/lib/db";
import AutonomousMatchConfig, {
  type AutonomousActiveSession,
  type AutonomousGameConfig,
  type AutonomousMatchConfigDoc,
} from "@/lib/models/AutonomousMatchConfig";
import AutonomousMatchLog from "@/lib/models/AutonomousMatchLog";
import PlatformEvent from "@/lib/models/PlatformEvent";
import CatalogGame from "@/lib/models/CatalogGame";
import {
  createHostRoom,
  deleteHostRoom,
  isGameHostConfigured,
} from "@/lib/gameHost/client";
import { games as staticGames } from "@/lib/data/games";
import { editions as staticEditions } from "@/lib/data/editions";

const DEFAULT_POPUP_GAMES: AutonomousGameConfig[] = [
  { slug: "openra", enabled: true, durationHours: 2, weight: 1 },
  { slug: "etlegacy", enabled: true, durationHours: 2, weight: 1 },
  { slug: "warzone-2100", enabled: true, durationHours: 2, weight: 1 },
  { slug: "xonotic", enabled: true, durationHours: 1.5, weight: 1 },
  { slug: "quake-3", enabled: true, durationHours: 1.5, weight: 1 },
  { slug: "unvanquished", enabled: true, durationHours: 2, weight: 1 },
  { slug: "mindustry", enabled: true, durationHours: 2, weight: 1 },
];

export async function getAutonomousConfig(): Promise<AutonomousMatchConfigDoc> {
  await dbConnect();
  let doc = await AutonomousMatchConfig.findOne({ key: "global" });
  if (!doc) {
    doc = await AutonomousMatchConfig.create({
      key: "global",
      enabled: false,
      frequencyHours: 12,
      leadTimeMinutes: 0,
      defaultDurationHours: 2,
      games: DEFAULT_POPUP_GAMES,
      discord: {
        webhookUrl: process.env.AUTONOMOUS_DISCORD_WEBHOOK_URL || process.env.DISCORD_BOT_WEBHOOK_URL || "",
        customTitle: "⚡ Pop-Up Match Live",
        customMessage: "A dedicated match server has been spun up! Click below to auto-install & join.",
      },
      activeSession: { status: "idle" },
    });
  }
  return doc;
}

export async function saveAutonomousConfig(
  update: Partial<{
    enabled: boolean;
    frequencyHours: number;
    leadTimeMinutes: number;
    defaultDurationHours: number;
    games: AutonomousGameConfig[];
    discord: {
      webhookUrl?: string | null;
      customTitle?: string | null;
      customMessage?: string | null;
    };
  }>
): Promise<AutonomousMatchConfigDoc> {
  await dbConnect();
  const doc = await AutonomousMatchConfig.findOneAndUpdate(
    { key: "global" },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

/**
 * Dispatches a silent Discord webhook notification.
 * Explicitly sends NO @everyone, @here, or role pings to avoid user fatigue.
 */
export async function sendSilentDiscordAnnouncement(params: {
  webhookUrl?: string | null;
  gameSlug: string;
  editionSlug?: string | null;
  gameTitle: string;
  host: string;
  port: number;
  durationHours: number;
  startsAt: Date;
  endsAt: Date;
  coverImage?: string | null;
  customTitle?: string | null;
  customMessage?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl =
    params.webhookUrl?.trim() ||
    process.env.AUTONOMOUS_DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_BOT_WEBHOOK_URL;

  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    return { ok: false, error: "No valid Discord Webhook URL configured" };
  }

  const joinDeepLink = params.editionSlug
    ? `playbound://join/${params.gameSlug}?edition=${encodeURIComponent(params.editionSlug)}&host=${params.host}&port=${params.port}&name=${encodeURIComponent(`Pop-Up ${params.gameTitle}`)}`
    : `playbound://join/${params.gameSlug}?host=${params.host}&port=${params.port}&name=${encodeURIComponent(`Pop-Up ${params.gameTitle}`)}`;
  const webGameUrl = params.editionSlug
    ? `https://playbound.gg/games/${params.gameSlug}/editions/${params.editionSlug}`
    : `https://playbound.gg/games/${params.gameSlug}`;
  const endTimestampUnix = Math.floor(params.endsAt.getTime() / 1000);

  const embedTitle = params.customTitle || `⚡ Pop-Up Game Night: ${params.gameTitle}`;
  const customBlurb = params.customMessage
    ? `${params.customMessage}\n\n`
    : "A dedicated server is live! Jump in for a pick-up match.\n\n";

  const payload = {
    // Empty content = silent embed, zero user or role mentions
    content: "",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: embedTitle,
        url: webGameUrl,
        description:
          `${customBlurb}` +
          `🎮 **Game:** ${params.gameTitle}\n` +
          `🌐 **Server:** \`${params.host}:${params.port}\`\n` +
          `⏳ **Active Until:** <t:${endTimestampUnix}:R> (<t:${endTimestampUnix}:t>)\n` +
          `⏱️ **Duration:** ${params.durationHours} hours\n\n` +
          `🚀 **[⚡ 1-Click Launch & Auto-Join](${joinDeepLink})**\n` +
          `*(Installs verified game version if missing and connects instantly)*\n\n` +
          `📥 **[Game Info & Web Download](${webGameUrl})**`,
        color: 0x6366f1, // Indigo / PlayBound purple
        thumbnail: params.coverImage
          ? {
              url: params.coverImage.startsWith("http")
                ? params.coverImage
                : `https://playbound.gg${params.coverImage}`,
            }
          : undefined,
        footer: {
          text: "PlayBound Automated Events • Dedicated Game Host",
        },
        timestamp: params.startsAt.toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `Discord responded with ${res.status}: ${errText}` };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook request failed";
    return { ok: false, error: message };
  }
}

/**
 * Checks and triggers an autonomous pop-up game server session if eligible.
 */
export async function evaluateAndTriggerAutonomousMatch(
  options: {
    force?: boolean;
    gameSlugOverride?: string;
    editionSlugOverride?: string;
  } = {}
): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  session?: AutonomousActiveSession;
}> {
  await dbConnect();
  // 1. Teardown check first if existing session has expired
  await checkAndTeardownExpiredMatches();

  // Reload config after teardown check
  const freshConfig = await getAutonomousConfig();

  if (!freshConfig.enabled && !options.force) {
    return { ok: false, skipped: true, reason: "Autonomous matchmaker is disabled in admin" };
  }

  // 2. Check if a session is currently active
  if (
    freshConfig.activeSession?.status === "live" &&
    freshConfig.activeSession.endsAt &&
    new Date(freshConfig.activeSession.endsAt) > new Date()
  ) {
    if (!options.force) {
      return {
        ok: false,
        skipped: true,
        reason: `Server already active for ${freshConfig.activeSession.gameTitle || freshConfig.activeSession.gameSlug}`,
      };
    }
  }

  // 3. Check Cooldown (if not force)
  if (!options.force && freshConfig.lastTriggeredAt) {
    const cooldownMs = (freshConfig.frequencyHours || 12) * 60 * 60 * 1000;
    const timeSinceLast = Date.now() - new Date(freshConfig.lastTriggeredAt).getTime();
    if (timeSinceLast < cooldownMs) {
      const remainingMinutes = Math.ceil((cooldownMs - timeSinceLast) / (60 * 1000));
      return {
        ok: false,
        skipped: true,
        reason: `Cooldown active. Next trigger available in ${remainingMinutes} minutes`,
      };
    }
  }

  // 4. Check VPS Game Host Availability
  if (!isGameHostConfigured()) {
    return { ok: false, reason: "GAME_HOST_URL or GAME_HOST_SECRET is not configured on this server" };
  }

  // 5. Select Game/Edition from Pool
  const enabledGames = (freshConfig.games || []).filter((g) => g.enabled);
  if (enabledGames.length === 0 && !options.gameSlugOverride) {
    return { ok: false, reason: "No games or editions enabled in the rotation pool" };
  }

  let selectedSlug = options.gameSlugOverride;
  let selectedEditionSlug = options.editionSlugOverride || null;
  let selectedEditionName: string | null = null;
  let gameDurationHours = freshConfig.defaultDurationHours || 2;

  if (!selectedSlug) {
    // Pick next game/edition in rotation or pseudo-random
    const pool = enabledGames;
    const randomIndex = Math.floor(Math.random() * pool.length);
    const chosen = pool[randomIndex];
    selectedSlug = chosen.slug;
    selectedEditionSlug = chosen.editionSlug || null;
    selectedEditionName = chosen.editionName || null;
    gameDurationHours = chosen.durationHours || gameDurationHours;
  } else {
    const configuredGame = enabledGames.find(
      (g) =>
        g.slug === selectedSlug &&
        (selectedEditionSlug ? g.editionSlug === selectedEditionSlug : !g.editionSlug)
    );
    if (configuredGame?.durationHours) {
      gameDurationHours = configuredGame.durationHours;
    }
    if (configuredGame?.editionName) {
      selectedEditionName = configuredGame.editionName;
    }
  }

  if (selectedEditionSlug && !selectedEditionName) {
    const staticEd = staticEditions.find(
      (e) => e.gameSlug === selectedSlug && e.slug === selectedEditionSlug
    );
    selectedEditionName = staticEd?.name || selectedEditionSlug;
  }

  // Resolve game metadata
  const dbGame = await CatalogGame.findOne({ slug: selectedSlug }).lean();
  const staticEntry = staticGames.find((g) => g.slug === selectedSlug);
  const baseTitle = (dbGame as { title?: string })?.title || staticEntry?.title || selectedSlug;
  const gameTitle = selectedEditionName ? `${baseTitle}: ${selectedEditionName}` : baseTitle;
  const coverImage = (dbGame as { coverImage?: string })?.coverImage || staticEntry?.coverImage || null;

  // 6. Spawn Server via VPS Game Host
  const partyId = `auto-popup-${selectedSlug}-${selectedEditionSlug ? `${selectedEditionSlug}-` : ""}${Date.now()}`;
  const roomResult = await createHostRoom({
    gameSlug: selectedSlug,
    editionSlug: selectedEditionSlug,
    partyId,
    name: `PlayBound Pop-Up: ${gameTitle}`,
  });

  if ("error" in roomResult) {
    // Log failure
    await AutonomousMatchLog.create({
      gameSlug: selectedSlug,
      editionSlug: selectedEditionSlug,
      gameTitle,
      startedAt: new Date(),
      status: "failed",
      error: roomResult.error,
    });
    return { ok: false, reason: `VPS Host failed to spawn room: ${roomResult.error}` };
  }

  const startsAt = new Date();
  const endsAt = new Date(Date.now() + gameDurationHours * 60 * 60 * 1000);

  // 7. Create Platform Game Night Event
  let eventDoc = null;
  try {
    eventDoc = await PlatformEvent.create({
      title: `⚡ Pop-Up Game Night: ${gameTitle}`,
      description: `Automated community match for ${gameTitle}. Connect with one click in the PlayBound launcher!`,
      eventType: "game_night",
      gameSlug: selectedSlug,
      editionSlug: selectedEditionSlug,
      coverImage: coverImage || undefined,
      hostType: "playbound",
      startsAt,
      endsAt,
      status: "in_progress",
      visibility: "public",
      featured: false,
    });
  } catch (err) {
    console.warn("[autonomous] failed to create PlatformEvent record:", err);
  }

  // 8. Dispatch Silent Discord Announcement
  await sendSilentDiscordAnnouncement({
    webhookUrl: freshConfig.discord?.webhookUrl,
    gameSlug: selectedSlug,
    editionSlug: selectedEditionSlug,
    gameTitle,
    host: roomResult.host,
    port: roomResult.port,
    durationHours: gameDurationHours,
    startsAt,
    endsAt,
    coverImage,
    customTitle: freshConfig.discord?.customTitle,
    customMessage: freshConfig.discord?.customMessage,
  });

  // 9. Update Active Session & History Log
  const newSession: AutonomousActiveSession = {
    roomId: roomResult.roomId,
    gameSlug: selectedSlug,
    editionSlug: selectedEditionSlug,
    gameTitle,
    partyId,
    host: roomResult.host,
    port: roomResult.port,
    eventId: eventDoc ? String(eventDoc._id) : null,
    startsAt,
    endsAt,
    status: "live",
  };

  await AutonomousMatchConfig.updateOne(
    { key: "global" },
    {
      $set: {
        activeSession: newSession,
        lastTriggeredAt: startsAt,
      },
    }
  );

  await AutonomousMatchLog.create({
    gameSlug: selectedSlug,
    editionSlug: selectedEditionSlug,
    gameTitle,
    roomId: roomResult.roomId,
    partyId,
    host: roomResult.host,
    port: roomResult.port,
    eventId: eventDoc?._id || null,
    startedAt: startsAt,
    endsAt,
    durationMinutes: Math.round(gameDurationHours * 60),
    status: "completed",
  });

  return { ok: true, session: newSession };
}

/**
 * Checks if the currently active match has reached its endsAt timestamp and tears it down.
 */
export async function checkAndTeardownExpiredMatches(): Promise<{
  tornDown: boolean;
  roomId?: string | null;
}> {
  await dbConnect();
  const config = await AutonomousMatchConfig.findOne({ key: "global" });
  if (!config || !config.activeSession || config.activeSession.status !== "live") {
    return { tornDown: false };
  }

  const session = config.activeSession;
  if (!session.endsAt || new Date(session.endsAt) > new Date()) {
    // Session is still within duration
    return { tornDown: false };
  }

  return stopAutonomousMatch("completed");
}

/**
 * Stops and tears down the active server immediately (either upon expiration or manual admin override).
 */
export async function stopAutonomousMatch(
  status: "completed" | "force_stopped" = "force_stopped"
): Promise<{ ok: boolean; tornDown: boolean; error?: string }> {
  await dbConnect();
  const config = await AutonomousMatchConfig.findOne({ key: "global" });
  if (!config || !config.activeSession || !config.activeSession.roomId) {
    return { ok: true, tornDown: false };
  }

  const roomId = config.activeSession.roomId;
  const eventId = config.activeSession.eventId;

  // 1. Delete Room on VPS
  try {
    await deleteHostRoom(roomId);
  } catch (err) {
    console.warn("[autonomous] deleteHostRoom failed:", err);
  }

  // 2. Mark event completed
  if (eventId) {
    try {
      await PlatformEvent.findByIdAndUpdate(eventId, {
        $set: { status: "completed" },
      });
    } catch {
      // ignore
    }
  }

  // 3. Update Match Log
  try {
    await AutonomousMatchLog.updateOne(
      { roomId },
      {
        $set: {
          stoppedAt: new Date(),
          status,
        },
      }
    );
  } catch {
    // ignore
  }

  // 4. Reset Session in Config
  await AutonomousMatchConfig.updateOne(
    { key: "global" },
    {
      $set: {
        "activeSession.status": "idle",
        "activeSession.roomId": null,
      },
    }
  );

  return { ok: true, tornDown: true };
}
