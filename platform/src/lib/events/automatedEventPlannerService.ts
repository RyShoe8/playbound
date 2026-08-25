import dbConnect from "@/lib/db";
import AutomatedEventConfig, {
  type AutomatedEventActiveSession,
  type AutomatedEventGameConfig,
  type AutomatedEventConfigDoc,
} from "@/lib/models/AutomatedEventConfig";
import AutomatedEventLog from "@/lib/models/AutomatedEventLog";
import PlatformEvent from "@/lib/models/PlatformEvent";
import CatalogGame from "@/lib/models/CatalogGame";
import {
  createHostRoom,
  deleteHostRoom,
  isGameHostConfigured,
} from "@/lib/gameHost/client";
import { isHostableGame } from "@/lib/gameHost/catalog";
import { games as staticGames } from "@/lib/data/games";
import { editions as staticEditions } from "@/lib/data/editions";

const DEFAULT_POPUP_GAMES: AutomatedEventGameConfig[] = [
  { slug: "openra", enabled: true, durationHours: 2, weight: 1 },
  { slug: "wolfenstein-enemy-territory", enabled: true, durationHours: 2, weight: 1 },
  { slug: "warzone-2100", enabled: true, durationHours: 2, weight: 1 },
  { slug: "xonotic", enabled: true, durationHours: 1.5, weight: 1 },
  { slug: "openarena", enabled: true, durationHours: 1.5, weight: 1 },
  { slug: "supertuxkart", enabled: true, durationHours: 1.5, weight: 1 },
  { slug: "mindustry", enabled: true, durationHours: 2, weight: 1 },
];

export async function getAutomatedEventConfig(): Promise<AutomatedEventConfigDoc> {
  await dbConnect();
  let doc = await AutomatedEventConfig.findOne({ key: "global" });
  if (!doc) {
    doc = await AutomatedEventConfig.create({
      key: "global",
      enabled: false,
      frequencyHours: 12,
      leadTimeMinutes: 60,
      defaultDurationHours: 2,
      games: DEFAULT_POPUP_GAMES,
      discord: {
        webhookUrl: process.env.AUTONOMOUS_DISCORD_WEBHOOK_URL || process.env.DISCORD_BOT_WEBHOOK_URL || "",
        customTitle: "⚡ Pop-Up Game Night Live",
        customMessage: "A dedicated match server has been spun up! Click below to auto-install & join.",
      },
      activeSession: { status: "idle" },
    });
  }
  return doc;
}

export async function saveAutomatedEventConfig(
  update: Partial<{
    enabled: boolean;
    frequencyHours: number;
    leadTimeMinutes: number;
    defaultDurationHours: number;
    games: AutomatedEventGameConfig[];
    discord: {
      webhookUrl?: string | null;
      customTitle?: string | null;
      customMessage?: string | null;
    };
  }>
): Promise<AutomatedEventConfigDoc> {
  await dbConnect();
  const doc = await AutomatedEventConfig.findOneAndUpdate(
    { key: "global" },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

/**
 * Dispatches a Discord webhook notification for when an event is scheduled in advance.
 */
export async function sendAdvanceDiscordAnnouncement(params: {
  webhookUrl?: string | null;
  gameSlug: string;
  editionSlug?: string | null;
  gameTitle: string;
  durationHours: number;
  startsAt: Date;
  endsAt: Date;
  eventId?: string | null;
  coverImage?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl =
    params.webhookUrl?.trim() ||
    process.env.AUTONOMOUS_DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_BOT_WEBHOOK_URL;

  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    return { ok: false, error: "No valid Discord Webhook URL configured" };
  }

  const startTimestampUnix = Math.floor(params.startsAt.getTime() / 1000);
  const webEventUrl = params.eventId
    ? `https://playbound.club/events/${params.eventId}`
    : `https://playbound.club/events`;
  const webGameUrl = params.editionSlug
    ? `https://playbound.club/games/${params.gameSlug}/editions/${params.editionSlug}`
    : `https://playbound.club/games/${params.gameSlug}`;

  const payload = {
    content: "",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `📅 Upcoming Game Night: ${params.gameTitle}`,
        url: webEventUrl,
        description:
          `A dedicated community pop-up match has been scheduled!\n\n` +
          `🎮 **Game:** ${params.gameTitle}\n` +
          `⏰ **Starts:** <t:${startTimestampUnix}:F> (<t:${startTimestampUnix}:R>)\n` +
          `⏱️ **Duration:** ${params.durationHours} hours\n\n` +
          `🎟️ **[RSVP & Event Details](${webEventUrl})**\n\n` +
          `🚀 **[Pre-Install with PlayBound Launcher](${webGameUrl})**`,
        color: 0x3b82f6, // Blue
        thumbnail: params.coverImage
          ? {
              url: params.coverImage.startsWith("http")
                ? params.coverImage
                : `https://playbound.club${params.coverImage}`,
            }
          : undefined,
        footer: {
          text: "PlayBound Automated Event Planner",
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
    return { ok: false, error: err instanceof Error ? err.message : "Webhook failed" };
  }
}

/**
 * Dispatches a silent Discord webhook notification when the match server goes live.
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
  eventId?: string | null;
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
    ? `https://playbound.club/games/${params.gameSlug}/editions/${params.editionSlug}`
    : `https://playbound.club/games/${params.gameSlug}`;
  const webEventUrl = params.eventId
    ? `https://playbound.club/events/${params.eventId}`
    : webGameUrl;
  const endTimestampUnix = Math.floor(params.endsAt.getTime() / 1000);

  const embedTitle = params.customTitle || `⚡ Pop-Up Game Night LIVE: ${params.gameTitle}`;
  const customBlurb = params.customMessage
    ? `${params.customMessage}\n\n`
    : "A dedicated match server is live! Jump in for a pick-up match.\n\n";

  const payload = {
    content: "",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: embedTitle,
        url: webEventUrl,
        description:
          `${customBlurb}` +
          `🎮 **Game:** ${params.gameTitle}\n` +
          `🌐 **Server:** \`${params.host}:${params.port}\`\n` +
          `⏳ **Active Until:** <t:${endTimestampUnix}:R> (<t:${endTimestampUnix}:t>)\n` +
          `⏱️ **Duration:** ${params.durationHours} hours\n\n` +
          `🚀 **[⚡ 1-Click Launch & Auto-Join](${joinDeepLink})**\n` +
          `*(Installs verified game version if missing and connects instantly)*\n\n` +
          `🎟️ **[Event Details & Community](${webEventUrl})**`,
        color: 0x6366f1, // Indigo / PlayBound purple
        thumbnail: params.coverImage
          ? {
              url: params.coverImage.startsWith("http")
                ? params.coverImage
                : `https://playbound.club${params.coverImage}`,
            }
          : undefined,
        footer: {
          text: "PlayBound Automated Event Planner • Dedicated Game Host",
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
 * Evaluates and schedules or triggers an automated game event.
 */
export async function evaluateAndTriggerAutomatedEvent(
  options: {
    force?: boolean;
    gameSlugOverride?: string;
    editionSlugOverride?: string;
    leadMinutesOverride?: number;
  } = {}
): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  session?: AutomatedEventActiveSession;
}> {
  await dbConnect();
  // 1. Teardown check first if existing session has expired or if scheduled event is ready to start
  await checkAndTeardownExpiredEvents();

  // Reload config after teardown check
  const freshConfig = await getAutomatedEventConfig();

  if (!freshConfig.enabled && !options.force) {
    return { ok: false, skipped: true, reason: "Automated Event Planner is disabled in admin" };
  }

  // 2. Check if a session is currently active or scheduled
  if (freshConfig.activeSession?.status === "live" || freshConfig.activeSession?.status === "scheduled") {
    const endsAt = freshConfig.activeSession.endsAt ? new Date(freshConfig.activeSession.endsAt) : null;
    if (endsAt && endsAt > new Date() && !options.force) {
      return {
        ok: false,
        skipped: true,
        reason: `Event already in progress/scheduled for ${freshConfig.activeSession.gameTitle || freshConfig.activeSession.gameSlug}`,
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
  if (options.gameSlugOverride && !isHostableGame(options.gameSlugOverride)) {
    return {
      ok: false,
      reason: `Game "${options.gameSlugOverride}" is not configured for VPS dedicated server hosting.`,
    };
  }

  // Fetch testing/draft statuses from DB to exclude games in testing
  const candidateDbGames = await CatalogGame.find({
    slug: { $in: (freshConfig.games || []).map((g) => g.slug) },
  })
    .select("slug status")
    .lean();
  const dbStatusBySlug = new Map<string, string>();
  for (const dg of candidateDbGames) {
    if ((dg as { slug?: string }).slug) {
      dbStatusBySlug.set((dg as { slug: string }).slug, (dg as { status?: string }).status || "published");
    }
  }

  const enabledGames = (freshConfig.games || []).filter((g) => {
    if (!g.enabled || !isHostableGame(g.slug)) return false;
    const st = dbStatusBySlug.get(g.slug) ?? staticGames.find((sg) => sg.slug === g.slug)?.status ?? "published";
    return st !== "testing" && st !== "draft";
  });

  if (enabledGames.length === 0 && !options.gameSlugOverride) {
    return { ok: false, reason: "No published hostable games or editions enabled in the rotation pool" };
  }

  let selectedSlug = options.gameSlugOverride;
  let selectedEditionSlug = options.editionSlugOverride || null;
  let selectedEditionName: string | null = null;
  let gameDurationHours = freshConfig.defaultDurationHours || 2;

  if (!selectedSlug) {
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

  const leadMinutes =
    options.leadMinutesOverride !== undefined
      ? options.leadMinutesOverride
      : Number(freshConfig.leadTimeMinutes) || 0;

  const startsAt = new Date(Date.now() + leadMinutes * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + gameDurationHours * 60 * 60 * 1000);
  const partyId = `auto-event-${selectedSlug}-${selectedEditionSlug ? `${selectedEditionSlug}-` : ""}${Date.now()}`;

  // 6. Create PlatformEvent Game Night record in MongoDB
  let eventDoc = null;
  try {
    eventDoc = await PlatformEvent.create({
      title: `⚡ Pop-Up Game Night: ${gameTitle}`,
      description: `Official community pop-up game night for ${gameTitle}. Automated dedicated server hosted by PlayBound Connect!`,
      eventType: "game_night",
      gameSlug: selectedSlug,
      editionSlug: selectedEditionSlug,
      coverImage: coverImage || undefined,
      hostType: "playbound",
      startsAt,
      endsAt,
      status: leadMinutes > 0 ? "registration_open" : "live",
      visibility: "public",
      featured: true,
      publishedAt: new Date(),
    });
  } catch (err) {
    console.warn("[automated-event] failed to create PlatformEvent record:", err);
  }

  // 7. If lead time > 0, schedule in advance and announce upcoming event
  if (leadMinutes > 0) {
    const scheduledSession: AutomatedEventActiveSession = {
      gameSlug: selectedSlug,
      editionSlug: selectedEditionSlug,
      gameTitle,
      partyId,
      eventId: eventDoc ? String(eventDoc._id) : null,
      startsAt,
      endsAt,
      status: "scheduled",
    };

    await AutomatedEventConfig.updateOne(
      { key: "global" },
      {
        $set: {
          activeSession: scheduledSession,
          lastTriggeredAt: new Date(),
        },
      }
    );

    await sendAdvanceDiscordAnnouncement({
      webhookUrl: freshConfig.discord?.webhookUrl,
      gameSlug: selectedSlug,
      editionSlug: selectedEditionSlug,
      gameTitle,
      durationHours: gameDurationHours,
      startsAt,
      endsAt,
      eventId: eventDoc ? String(eventDoc._id) : null,
      coverImage,
    });

    return { ok: true, session: scheduledSession };
  }

  // 8. If starting immediately (leadMinutes === 0): Spawn Server via VPS Game Host
  const roomResult = await createHostRoom({
    gameSlug: selectedSlug,
    editionSlug: selectedEditionSlug,
    partyId,
    name: `PlayBound Pop-Up: ${gameTitle}`,
  });

  if ("error" in roomResult) {
    await AutomatedEventLog.create({
      gameSlug: selectedSlug,
      editionSlug: selectedEditionSlug,
      gameTitle,
      startedAt: new Date(),
      status: "failed",
      error: roomResult.error,
    });
    return { ok: false, reason: `VPS Host failed to spawn room: ${roomResult.error}` };
  }

  // Dispatch Live Discord Announcement
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
    eventId: eventDoc ? String(eventDoc._id) : null,
    coverImage,
    customTitle: freshConfig.discord?.customTitle,
    customMessage: freshConfig.discord?.customMessage,
  });

  // Update Active Session & History Log
  const newSession: AutomatedEventActiveSession = {
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

  await AutomatedEventConfig.updateOne(
    { key: "global" },
    {
      $set: {
        activeSession: newSession,
        lastTriggeredAt: startsAt,
      },
    }
  );

  await AutomatedEventLog.create({
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
 * Checks if the currently active match has reached its endsAt timestamp and tears it down,
 * or starts a scheduled match when startsAt arrives.
 */
export async function checkAndTeardownExpiredEvents(): Promise<{
  tornDown: boolean;
  started?: boolean;
  roomId?: string | null;
}> {
  await dbConnect();
  const config = await AutomatedEventConfig.findOne({ key: "global" });
  if (!config || !config.activeSession || config.activeSession.status === "idle") {
    return { tornDown: false };
  }

  const session = config.activeSession;
  const now = new Date();

  // A. Check if a scheduled match has reached its startsAt time -> spin up server
  if (session.status === "scheduled" && session.startsAt && new Date(session.startsAt) <= now) {
    if (session.gameSlug) {
      const durationHours = session.endsAt && session.startsAt
        ? (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / (3600 * 1000)
        : 2;

      const roomResult = await createHostRoom({
        gameSlug: session.gameSlug,
        editionSlug: session.editionSlug || undefined,
        partyId: session.partyId || `auto-event-${session.gameSlug}-${Date.now()}`,
        name: `PlayBound Pop-Up: ${session.gameTitle || session.gameSlug}`,
      });

      if (!("error" in roomResult)) {
        session.status = "live";
        session.roomId = roomResult.roomId;
        session.host = roomResult.host;
        session.port = roomResult.port;

        await AutomatedEventConfig.updateOne(
          { key: "global" },
          { $set: { activeSession: session } }
        );

        if (session.eventId) {
          await PlatformEvent.findByIdAndUpdate(session.eventId, {
            $set: { status: "live" },
          });
        }

        await sendSilentDiscordAnnouncement({
          webhookUrl: config.discord?.webhookUrl,
          gameSlug: session.gameSlug,
          editionSlug: session.editionSlug,
          gameTitle: session.gameTitle || session.gameSlug,
          host: roomResult.host,
          port: roomResult.port,
          durationHours,
          startsAt: session.startsAt ? new Date(session.startsAt) : now,
          endsAt: session.endsAt ? new Date(session.endsAt) : new Date(now.getTime() + 2 * 3600 * 1000),
          eventId: session.eventId,
          customTitle: config.discord?.customTitle,
          customMessage: config.discord?.customMessage,
        });

        return { tornDown: false, started: true, roomId: roomResult.roomId };
      }
    }
  }

  // B. Check if a live match has ended
  if (session.status === "live" && session.endsAt && new Date(session.endsAt) <= now) {
    return stopAutomatedEvent("completed");
  }

  return { tornDown: false };
}

/**
 * Stops and tears down the active server immediately.
 */
export async function stopAutomatedEvent(
  status: "completed" | "force_stopped" = "force_stopped"
): Promise<{ ok: boolean; tornDown: boolean; error?: string }> {
  await dbConnect();
  const config = await AutomatedEventConfig.findOne({ key: "global" });
  if (!config || !config.activeSession) {
    return { ok: true, tornDown: false };
  }

  const roomId = config.activeSession.roomId;
  const eventId = config.activeSession.eventId;

  // 1. Delete Room on VPS
  if (roomId) {
    try {
      await deleteHostRoom(roomId);
    } catch (err) {
      console.warn("[automated-event] deleteHostRoom failed:", err);
    }
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

  // 3. Update Log
  if (roomId) {
    try {
      await AutomatedEventLog.updateOne(
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
  }

  // 4. Reset Session in Config
  await AutomatedEventConfig.updateOne(
    { key: "global" },
    {
      $set: {
        activeSession: { status: "idle" },
      },
    }
  );

  return { ok: true, tornDown: true };
}

// Backwards compatibility aliases
export const getAutonomousConfig = getAutomatedEventConfig;
export const saveAutonomousConfig = saveAutomatedEventConfig;
export const evaluateAndTriggerAutonomousMatch = evaluateAndTriggerAutomatedEvent;
export const checkAndTeardownExpiredMatches = checkAndTeardownExpiredEvents;
export const stopAutonomousMatch = stopAutomatedEvent;
