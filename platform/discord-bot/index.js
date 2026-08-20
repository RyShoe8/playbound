/**
 * PlayBound Discord bot — run on Render (or similar) as a long-lived worker.
 *
 * Env:
 *   DISCORD_BOT_TOKEN
 *   DISCORD_GUILD_ID
 *   MONGODB_URI
 *   SITE_URL (default https://playbound.club)
 *   BOT_WEBHOOK_SECRET — shared with Next admin provision API
 *   PORT — HTTP health + provision webhook (default 8787)
 *
 * Discord Developer Portal: enable Message Content Intent (required to read
 * party/event text-channel messages for PlayBound chat).
 *
 * Channel layout:
 * - Single-edition / no editions: #slug under GAME CHANNELS — A–M / N–Z
 * - Multi-edition games (2+ public active editions):
 *     Category named after the game title
 *       #general          ← game-level invite (stored on cataloggames)
 *       #edition-slug …   ← one channel per public active edition
 */

import http from "node:http";
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { MongoClient } from "mongodb";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const MONGODB_URI = process.env.MONGODB_URI;
const SITE_URL = (process.env.SITE_URL || "https://playbound.club").replace(/\/$/, "");
const WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET || "";
const PORT = Number(process.env.PORT || 8787);
const PROVISION_DELAY_MS = 1500;

if (!TOKEN || !GUILD_ID || !MONGODB_URI) {
  console.error("Missing DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, or MONGODB_URI");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const mongo = new MongoClient(MONGODB_URI);
let games;
let editions;
let backfillRunning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function categoryNameForSlug(slug) {
  const ch = (slug[0] || "a").toLowerCase();
  return ch >= "n" ? "GAME CHANNELS — N–Z" : "GAME CHANNELS — A–M";
}

/** Discord channel names: lowercase, a–z 0–9 hyphen, max 90. */
function discordChannelName(raw) {
  return String(raw || "channel")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "channel";
}

/** Party voice: `party-` + sanitized display name, Discord 100-char limit. */
function partyVoiceChannelName(raw, fallbackId) {
  const safe = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const shortId = String(fallbackId || "").replace(/[^a-z0-9]/gi, "").slice(-6) || "voice";
  return `party-${safe && safe !== "party" ? safe : shortId}`.slice(0, 100);
}

function partyTextChannelName(raw, fallbackId) {
  const safe = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const shortId = String(fallbackId || "").replace(/[^a-z0-9]/gi, "").slice(-6) || "chat";
  return `party-${safe && safe !== "party" ? safe : shortId}-chat`.slice(0, 100);
}

/**
 * Event channel names. Same shape parties use, kept as helpers so the create
 * and rename paths cannot drift apart.
 */
function eventNameSlug(raw, fallbackId) {
  const safe = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  if (safe) return safe;
  return String(fallbackId || "").replace(/[^a-z0-9]/gi, "").slice(-6) || "event";
}

function eventVoiceChannelName(raw, fallbackId) {
  return `voice-${eventNameSlug(raw, fallbackId)}`.slice(0, 90);
}

function eventTextChannelName(raw, fallbackId) {
  return `event-${eventNameSlug(raw, fallbackId)}`.slice(0, 90);
}

/** Category a temporary channel belongs under: the game's area, or Events. */
const EVENTS_CATEGORY_NAME = "Events";

async function resolveGameCategoryId(guild, gameSlug) {
  const slug = String(gameSlug || "").trim();
  if (!slug) return null;
  if (games) {
    const game = await games.findOne({ slug });
    const textId = game?.communityLinks?.playboundDiscord?.channelId;
    if (textId) {
      try {
        const text = await guild.channels.fetch(String(textId));
        if (text?.parentId) return text.parentId;
      } catch (err) {
        console.warn("resolve game category", textId, err?.message || err);
      }
    }
  }
  const cat = await ensureCategory(guild, categoryNameForSlug(slug));
  return cat.id;
}

/**
 * Where an event's channels live: under its game's area once a game is picked,
 * otherwise in one shared Events category. Mirrors how a party channel is
 * placed by /parties/voice/place.
 */
async function resolveEventCategoryId(guild, gameSlug) {
  const fromGame = await resolveGameCategoryId(guild, gameSlug);
  if (fromGame) return fromGame;
  const cat = await ensureCategory(guild, EVENTS_CATEGORY_NAME);
  return cat.id;
}

/**
 * Shared categories are reused by every event and game, so cleanup must never
 * delete one — only the per-event categories the old provisioning flow made.
 */
function isSharedCategoryName(name) {
  const n = String(name || "");
  return (
    n === EVENTS_CATEGORY_NAME ||
    n.startsWith("GAME CHANNELS") ||
    n === "PlayBound Parties"
  );
}

function franchiseCategoryName(title) {
  return String(title || "Game").trim().slice(0, 100) || "Game";
}

function welcomeBody(game) {
  const slug = game.slug;
  return [
    `Welcome to the PlayBound **${game.title}** channel.`,
    "",
    `Game page: ${SITE_URL}/games/${slug}`,
    `Install: ${SITE_URL}/games/${slug}?tab=install`,
    `Servers: ${SITE_URL}/games/${slug}?tab=servers`,
    `Discussion: ${SITE_URL}/games/${slug}?tab=discussion`,
    "",
    "Use this channel for live conversation and finding players.",
    "Use the PlayBound Discussion tab for guides, technical questions,",
    "solutions and information that should remain searchable.",
  ].join("\n");
}

function editionWelcomeBody(game, edition) {
  return [
    `Welcome to the PlayBound **${edition.name}** channel (${game.title}).`,
    "",
    `Edition page: ${SITE_URL}/games/${game.slug}/editions/${edition.slug}`,
    `Game hub: ${SITE_URL}/games/${game.slug}`,
    `All editions: ${SITE_URL}/games/${game.slug}#editions`,
    "",
    "Use this channel for live chat about this edition.",
    "Use PlayBound Discussion on the edition page for searchable help.",
  ].join("\n");
}

function playboundRecord(channel, invite, previous) {
  return {
    guildId: GUILD_ID,
    channelId: channel.id,
    channelName: channel.name,
    inviteCode: invite.code,
    inviteUrl: invite.url,
    provisionedAt: previous?.provisionedAt || new Date(),
  };
}

async function ensurePartiesCategoryAtBottom(guild) {
  try {
    const channels = await guild.channels.fetch();
    const partiesCat = channels.find(
      (c) => c && c.type === ChannelType.GuildCategory && c.name === "PlayBound Parties"
    );
    if (!partiesCat) return;

    const categories = [...channels.values()].filter(
      (c) => c && c.type === ChannelType.GuildCategory
    );
    const maxPos = categories.length + 10;
    if (partiesCat.position < categories.length - 1) {
      await partiesCat.setPosition(maxPos).catch(() => {});
    }
  } catch (err) {
    console.warn("[parties] Failed to reposition PlayBound Parties to bottom:", err?.message || err);
  }
}

async function ensureCategory(guild, name) {
  const match = (c) => c && c.type === ChannelType.GuildCategory && c.name === name;
  const cached = guild.channels.cache.find(match);
  if (cached) {
    if (name !== "PlayBound Parties") void ensurePartiesCategoryAtBottom(guild);
    return cached;
  }
  const fetched = await guild.channels.fetch();
  const existing = fetched.find(match);
  if (existing) {
    if (name !== "PlayBound Parties") void ensurePartiesCategoryAtBottom(guild);
    return existing;
  }
  const created = await guild.channels.create({ name, type: ChannelType.GuildCategory });
  if (name === "PlayBound Parties") {
    const categories = [...guild.channels.cache.values()].filter(
      (c) => c && c.type === ChannelType.GuildCategory
    );
    await created.setPosition(categories.length + 10).catch(() => {});
  } else {
    void ensurePartiesCategoryAtBottom(guild);
  }
  return created;
}

function isExcludedEdition(edition) {
  if (!edition) return false;
  const slug = String(edition.slug || "").toLowerCase().trim();
  const name = String(edition.name || "").toLowerCase().trim();
  return (
    slug === "official" ||
    slug === "base" ||
    slug === "base-game" ||
    slug === "default" ||
    slug === "steam" ||
    slug === "steam-edition" ||
    slug === "steam-release" ||
    slug === "gog" ||
    slug === "gog-edition" ||
    slug === "epic" ||
    slug === "epic-games" ||
    name === "official" ||
    name === "base game" ||
    name === "default" ||
    name === "steam" ||
    name === "steam edition" ||
    name === "steam release" ||
    name === "gog" ||
    name === "gog edition" ||
    name === "epic games" ||
    edition.isDefault === true
  );
}

async function listPublicEditions(gameSlug) {
  const all = await editions
    .find({
      gameSlug,
      visibility: "public",
      status: "active",
    })
    .project({
      slug: 1,
      name: 1,
      isDefault: 1,
      playboundDiscord: 1,
      sortOrder: 1,
    })
    .sort({ sortOrder: 1, name: 1 })
    .toArray();
  return all.filter((e) => !isExcludedEdition(e));
}

/**
 * Ensure a text channel exists (by id, then by name under parent when provided).
 * Returns { channel, created }.
 */
async function ensureTextChannel(guild, {
  preferredId,
  name,
  parentId,
  topic,
  /** Extra channel ids that may be adopted (e.g. legacy flat #game-slug). */
  alsoAdoptIds = [],
}) {
  let channel = preferredId ? guild.channels.cache.get(preferredId) : null;
  let created = false;

  if (!channel || channel.type !== ChannelType.GuildText) {
    for (const id of alsoAdoptIds) {
      const hit = guild.channels.cache.get(id);
      if (hit && hit.type === ChannelType.GuildText) {
        channel = hit;
        break;
      }
    }
  }

  if (!channel || channel.type !== ChannelType.GuildText) {
    channel = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildText &&
        c.name === name &&
        (parentId ? c.parentId === parentId : true)
    ) || null;
  }

  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parentId || undefined,
      topic: topic || undefined,
    });
    created = true;
  } else {
    if (parentId && channel.parentId !== parentId) {
      await channel.setParent(parentId, { lockPermissions: false }).catch(() => {});
    }
    if (channel.name !== name) {
      await channel.setName(name).catch(() => {});
    }
    if (topic && channel.topic !== topic) {
      await channel.setTopic(topic).catch(() => {});
    }
  }

  return { channel, created };
}

async function inviteFor(channel) {
  return channel.createInvite({
    maxAge: 0,
    maxUses: 0,
    unique: false,
    reason: "PlayBound permanent game invite",
  });
}

/**
 * Flat layout: #slug under A–M / N–Z letter bucket (games with no custom editions).
 */
async function provisionFlatChannel(guild, game) {
  const slug = game.slug;
  const channelName = discordChannelName(slug);
  const existingId = game.communityLinks?.playboundDiscord?.channelId;
  const cat = await ensureCategory(guild, categoryNameForSlug(slug));
  const topic = `${game.title} on PlayBound — ${SITE_URL}/games/${slug}`;

  const { channel, created } = await ensureTextChannel(guild, {
    preferredId: existingId,
    name: channelName,
    parentId: cat.id,
    topic,
  });

  const invite = await inviteFor(channel);
  if (created) {
    const msg = await channel.send(welcomeBody(game));
    await msg.pin().catch(() => {});
  }

  const prev = game.communityLinks?.playboundDiscord;
  const playboundDiscord = {
    ...playboundRecord(channel, invite, prev),
    provisionedAt: created ? new Date() : prev?.provisionedAt || new Date(),
  };

  const links = {
    ...(game.communityLinks || {}),
    playboundDiscord,
  };
  await games.updateOne({ slug }, { $set: { communityLinks: links } });
  return { playboundDiscord, created, editions: [], layout: "flat" };
}

/**
 * Franchise layout: Category(title) → #game-slug + #edition-slug…
 */
async function provisionFranchise(guild, game, publicEditions) {
  const slug = game.slug;
  const mainChannelName = discordChannelName(slug);
  const cat = await ensureCategory(guild, franchiseCategoryName(game.title));
  const topic = `${game.title} on PlayBound — ${SITE_URL}/games/${slug}`;

  // Prefer stored id; also adopt a legacy flat #slug channel or a legacy #general channel under this category.
  let mainPreferredId = game.communityLinks?.playboundDiscord?.channelId || null;
  const legacyFlat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === mainChannelName
  );
  const legacyGeneral = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === "general" && c.parentId === cat.id
  );
  const alsoAdoptIds = [];
  if (legacyFlat && legacyFlat.id !== mainPreferredId) alsoAdoptIds.push(legacyFlat.id);
  if (legacyGeneral && legacyGeneral.id !== mainPreferredId) alsoAdoptIds.push(legacyGeneral.id);

  const mainResult = await ensureTextChannel(guild, {
    preferredId: mainPreferredId,
    name: mainChannelName,
    parentId: cat.id,
    topic,
    alsoAdoptIds,
  });

  // Clean up any redundant #official, #steam, or extra #general under this category
  for (const ch of guild.channels.cache.values()) {
    if (ch && ch.parentId === cat.id && ch.type === ChannelType.GuildText) {
      if (
        ch.name === "official" ||
        ch.name === "base-game" ||
        ch.name === "default" ||
        ch.name === "steam" ||
        ch.name === "steam-edition" ||
        ch.name === "steam-release" ||
        ch.name === "gog" ||
        ch.name === "epic"
      ) {
        await ch.delete("PlayBound cleanup: remove redundant official/steam channel").catch(() => {});
      } else if (ch.name === "general" && ch.id !== mainResult.channel.id) {
        await ch.delete("PlayBound cleanup: remove redundant general channel").catch(() => {});
      }
    }
  }

  const mainInvite = await inviteFor(mainResult.channel);
  if (mainResult.created) {
    const msg = await mainResult.channel.send(welcomeBody(game));
    await msg.pin().catch(() => {});
  }

  const prevMain = game.communityLinks?.playboundDiscord;
  const playboundDiscord = {
    ...playboundRecord(mainResult.channel, mainInvite, prevMain),
    provisionedAt: mainResult.created
      ? new Date()
      : prevMain?.provisionedAt || new Date(),
  };

  await games.updateOne(
    { slug },
    {
      $set: {
        communityLinks: {
          ...(game.communityLinks || {}),
          playboundDiscord,
        },
      },
    }
  );

  const editionResults = [];
  let anyEditionCreated = false;

  for (const edition of publicEditions) {
    const edName = discordChannelName(edition.slug);
    const edTopic = `${edition.name} · ${game.title} — ${SITE_URL}/games/${slug}/editions/${edition.slug}`;
    const { channel, created } = await ensureTextChannel(guild, {
      preferredId: edition.playboundDiscord?.channelId,
      name: edName,
      parentId: cat.id,
      topic: edTopic,
    });

    const invite = await inviteFor(channel);
    if (created) {
      anyEditionCreated = true;
      const msg = await channel.send(editionWelcomeBody(game, edition));
      await msg.pin().catch(() => {});
    }

    const record = {
      ...playboundRecord(channel, invite, edition.playboundDiscord),
      provisionedAt: created
        ? new Date()
        : edition.playboundDiscord?.provisionedAt || new Date(),
    };

    await editions.updateOne(
      { _id: edition._id },
      { $set: { playboundDiscord: record } }
    );

    editionResults.push({
      slug: edition.slug,
      created,
      playboundDiscord: record,
    });

    await sleep(400);
  }

  return {
    playboundDiscord,
    created: mainResult.created || anyEditionCreated,
    editions: editionResults,
    layout: "franchise",
  };
}

/**
 * Clean up redundant #official and #general channels across all game categories,
 * and delete any Archive categories and archived channels.
 */
async function cleanupArchiveSection(guild) {
  const channels = await guild.channels.fetch();
  const archiveCategories = [...channels.values()].filter(
    (c) => c && c.type === ChannelType.GuildCategory && /archive/i.test(c.name)
  );

  for (const cat of archiveCategories) {
    const children = [...channels.values()].filter((c) => c && c.parentId === cat.id);
    for (const child of children) {
      console.log(`[cleanup] Deleting archived channel #${child.name}`);
      await child.delete("PlayBound cleanup: deleting archived channel").catch((err) => {
        console.warn(`[cleanup] Failed to delete archived #${child.name}:`, err?.message || err);
      });
      await sleep(PROVISION_DELAY_MS);
    }
    console.log(`[cleanup] Deleting archive category "${cat.name}"`);
    await cat.delete("PlayBound cleanup: removing archive category").catch((err) => {
      console.warn(`[cleanup] Failed to delete archive category:`, err?.message || err);
    });
    await sleep(PROVISION_DELAY_MS);
  }

  // Clear dead Discord references from unpublished games in MongoDB
  await games.updateMany(
    {
      $and: [
        { status: { $ne: "published" } },
        { published: { $ne: true } },
        { "communityLinks.playboundDiscord.channelId": { $nin: [null, ""] } },
      ],
    },
    { $unset: { "communityLinks.playboundDiscord": "" } }
  );
}

async function cleanupRedundantChannels(guild) {
  await cleanupArchiveSection(guild);

  const serverGeneral = await findServerGeneral(guild);
  const channels = await guild.channels.fetch();

  for (const channel of channels.values()) {
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    if (serverGeneral && channel.id === serverGeneral.id) continue;

    const parent = channel.parentId ? guild.channels.cache.get(channel.parentId) : null;
    if (!parent || isSharedCategoryName(parent.name)) continue;

    if (
      channel.name === "official" ||
      channel.name === "base-game" ||
      channel.name === "default" ||
      channel.name === "steam" ||
      channel.name === "steam-edition" ||
      channel.name === "steam-release" ||
      channel.name === "gog" ||
      channel.name === "epic"
    ) {
      console.log(`[cleanup] Deleting #${channel.name} in category "${parent.name}"`);
      await channel.delete("PlayBound cleanup: redundant official/steam channel").catch((err) => {
        console.warn(`[cleanup] Failed to delete #${channel.name}:`, err?.message || err);
      });
      await sleep(PROVISION_DELAY_MS);
    } else if (channel.name === "general") {
      console.log(`[cleanup] Deleting redundant #general in category "${parent.name}"`);
      await channel.delete("PlayBound cleanup: redundant general channel in game category").catch((err) => {
        console.warn(`[cleanup] Failed to delete #general in "${parent.name}":`, err?.message || err);
      });
      await sleep(PROVISION_DELAY_MS);
    }
  }

  // Delete any abandoned empty categories
  const updatedChannels = await guild.channels.fetch();
  const categories = [...updatedChannels.values()].filter(
    (c) => c && c.type === ChannelType.GuildCategory && !isSharedCategoryName(c.name)
  );
  for (const cat of categories) {
    const children = [...updatedChannels.values()].filter((c) => c && c.parentId === cat.id);
    if (children.length === 0) {
      console.log(`[cleanup] Deleting empty category "${cat.name}"`);
      await cat.delete("PlayBound cleanup: removing empty category").catch(() => {});
      await sleep(PROVISION_DELAY_MS);
    }
  }

  await ensurePartiesCategoryAtBottom(guild);
}

/**
 * Idempotent provision for one published game (flat or franchise).
 */
async function provisionChannel(slug) {
  const game = await games.findOne({
    slug,
    $or: [{ status: "published" }, { published: true }],
  });
  if (!game) throw new Error(`Unknown or unpublished game: ${slug}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();

  const publicEditions = await listPublicEditions(slug);
  if (publicEditions.length >= 1) {
    return provisionFranchise(guild, game, publicEditions);
  }
  return provisionFlatChannel(guild, game);
}

async function gameNeedsProvision(game) {
  const publicEds = await listPublicEditions(game.slug);
  const mainChannelName = discordChannelName(game.slug);
  if (publicEds.length >= 1) {
    const hasMain = Boolean(game.communityLinks?.playboundDiscord?.channelId);
    const edsMissing = publicEds.some((e) => !e.playboundDiscord?.channelId);
    return !hasMain || edsMissing;
  }
  return !game.communityLinks?.playboundDiscord?.channelId;
}

async function provisionMissing() {
  if (backfillRunning) {
    return { provisioned: 0, skipped: 0, failed: [], note: "already running" };
  }
  backfillRunning = true;
  const provisioned = [];
  const skipped = [];
  const failed = [];

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.channels.fetch();
    await cleanupRedundantChannels(guild);

    const list = await games
      .find({ $or: [{ status: "published" }, { published: true }] })
      .project({ slug: 1, title: 1, communityLinks: 1 })
      .toArray();

    const needs = [];
    for (const doc of list) {
      if (await gameNeedsProvision(doc)) needs.push(doc);
    }

    console.log(
      `Discord backfill: ${needs.length} published game(s) need channel work (${list.length} published total)`
    );

    for (const doc of needs) {
      try {
        const result = await provisionChannel(doc.slug);
        if (result.created) {
          provisioned.push(doc.slug);
          console.log(`Provisioned ${doc.slug} (${result.layout})`);
        } else {
          skipped.push(doc.slug);
          console.log(`Linked existing ${doc.slug} (${result.layout})`);
        }
      } catch (err) {
        failed.push({ slug: doc.slug, error: String(err?.message || err) });
        console.error(`Failed to provision ${doc.slug}:`, err?.message || err);
      }
      await sleep(PROVISION_DELAY_MS);
    }
  } finally {
    backfillRunning = false;
  }

  console.log(
    `Discord backfill done: provisioned=${provisioned.length} linked=${skipped.length} failed=${failed.length}`
  );
  return { provisioned, skipped, failed };
}

const ARCHIVE_CATEGORY_NAME = "ARCHIVE — UNPUBLISHED";
let reconcileRunning = false;

/** The name and category a game's primary channel should currently have. */
async function expectedPlacement(game) {
  const publicEds = await listPublicEditions(game.slug);
  const franchise = publicEds.length >= 1;
  return {
    name: discordChannelName(game.slug),
    category: franchise
      ? franchiseCategoryName(game.title)
      : categoryNameForSlug(game.slug),
  };
}

/**
 * Daily drift repair: names, categories, and archiving.
 *
 * Distinct from provisionMissing, which only ever touches games that lack a
 * channel. Once a channel exists nothing revisits it, so renaming a game or
 * changing its slug leaves the Discord side stranded under the old name —
 * which is what this reconciles.
 *
 * Deliberately narrow. It renames, re-parents, and moves the channels of
 * unpublished games into an archive category where @everyone loses
 * SendMessages but keeps ViewChannel. It never deletes a channel and never
 * creates one: message history is not ours to destroy, and provisioning new
 * channels is provisionMissing's job. Every effect is reversible by hand.
 */
async function reconcileChannels(opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  if (reconcileRunning) {
    return { note: "already running", renamed: [], moved: [], archived: [], failed: [] };
  }
  reconcileRunning = true;

  const renamed = [];
  const moved = [];
  const archived = [];
  const unprovisioned = [];
  const failed = [];

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.channels.fetch();
    if (!dryRun) {
      await cleanupRedundantChannels(guild);
    }

    /* ── published games: correct name + category ── */
    const published = await games
      .find({ $or: [{ status: "published" }, { published: true }] })
      .project({ slug: 1, title: 1, communityLinks: 1 })
      .toArray();

    for (const game of published) {
      try {
        const channelId = game.communityLinks?.playboundDiscord?.channelId;
        const channel = channelId ? guild.channels.cache.get(channelId) : null;
        // No channel yet is provisionMissing's business, not ours.
        if (!channel || channel.type !== ChannelType.GuildText) {
          unprovisioned.push(game.slug);
          continue;
        }

        const want = await expectedPlacement(game);

        if (channel.name !== want.name) {
          renamed.push({ slug: game.slug, from: channel.name, to: want.name });
          if (!dryRun) {
            await channel.setName(want.name, "PlayBound daily reconcile");
            await sleep(PROVISION_DELAY_MS);
          }
        }

        const parent = channel.parentId ? guild.channels.cache.get(channel.parentId) : null;
        if (!parent || parent.name !== want.category) {
          moved.push({
            slug: game.slug,
            from: parent?.name || "(none)",
            to: want.category,
          });
          if (!dryRun) {
            const cat = await ensureCategory(guild, want.category);
            await channel.setParent(cat.id, { lockPermissions: false });
            await sleep(PROVISION_DELAY_MS);
          }
        }
      } catch (err) {
        failed.push({ slug: game.slug, error: String(err?.message || err) });
      }
    }

    /* ── unpublished games that still hold a channel: delete channel ── */
    const retired = await games
      .find({
        $and: [
          { status: { $ne: "published" } },
          { published: { $ne: true } },
          { "communityLinks.playboundDiscord.channelId": { $nin: [null, ""] } },
        ],
      })
      .project({ slug: 1, title: 1, communityLinks: 1 })
      .toArray();

    for (const game of retired) {
      try {
        const channelId = game.communityLinks?.playboundDiscord?.channelId;
        const channel = guild.channels.cache.get(channelId);
        if (channel && channel.type === ChannelType.GuildText) {
          archived.push({ slug: game.slug, channel: channel.name });
          if (!dryRun) {
            console.log(`[reconcile] Deleting unpublished game channel #${channel.name}`);
            await channel.delete("PlayBound reconcile: deleting unpublished game channel").catch(() => {});
            await games.updateOne(
              { slug: game.slug },
              { $unset: { "communityLinks.playboundDiscord": "" } }
            );
            await sleep(PROVISION_DELAY_MS);
          }
        }
      } catch (err) {
        failed.push({ slug: game.slug, error: String(err?.message || err) });
      }
    }
  } finally {
    reconcileRunning = false;
  }

  console.log(
    `Discord reconcile${dryRun ? " (dry run)" : ""}: renamed=${renamed.length} moved=${moved.length} archived=${archived.length} unprovisioned=${unprovisioned.length} failed=${failed.length}`
  );
  return { dryRun, renamed, moved, archived, unprovisioned, failed };
}

async function postGameOfTheWeek() {
  const gotw = await games.findOne({
    $or: [{ status: "published" }, { published: true }],
    gameOfWeek: true,
  });
  if (!gotw) return;
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel =
    guild.channels.cache.find((c) => c.name === "playbound-weekly") ||
    guild.channels.cache.find((c) => c.name === "announcements");
  if (!channel || !channel.isTextBased()) return;
  await channel.send(
    `**Game of the Week:** [${gotw.title}](${SITE_URL}/games/${gotw.slug})\n${gotw.tagline || ""}\nDiscussion: ${SITE_URL}/games/${gotw.slug}?tab=discussion`
  );
}

function isGameOrEventCategoryName(name) {
  const n = String(name || "");
  return (
    n.startsWith("GAME CHANNELS") ||
    n.startsWith("Event —") ||
    n.startsWith("PlayBound —")
  );
}

/** Server #general — not franchise #general under a game category. */
async function findServerGeneral(guild) {
  const configured = process.env.DISCORD_GENERAL_CHANNEL_ID;
  if (configured) {
    const ch = await guild.channels.fetch(configured).catch(() => null);
    if (ch?.isTextBased()) return ch;
  }
  await guild.channels.fetch();
  const generals = [...guild.channels.cache.values()].filter(
    (c) => c.type === ChannelType.GuildText && c.name === "general"
  );
  const preferred = generals.find((c) => !isGameOrEventCategoryName(c.parent?.name));
  return preferred || generals[0] || null;
}

async function announceNewCatalogGame(payload) {
  const title = String(payload.title || "New game").slice(0, 256);
  const url = String(payload.url || `${SITE_URL}/games/${payload.slug || ""}`);
  const description = String(payload.description || "A new game is on PlayBound.").slice(0, 4000);
  const imageUrl = typeof payload.imageUrl === "string" && /^https?:\/\//i.test(payload.imageUrl)
    ? payload.imageUrl
    : null;

  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = await findServerGeneral(guild);
  if (!channel?.isTextBased()) {
    throw new Error("Could not find server #general");
  }

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(title)
    .setURL(url)
    .setDescription(description)
    .setFooter({ text: "New on PlayBound" });
  if (imageUrl) embed.setImage(imageUrl);

  await channel.send({
    content: `**${title}** was just added to the catalog.`,
    embeds: [embed],
  });
}

const commands = [
  new SlashCommandBuilder()
    .setName("game")
    .setDescription("Open a PlayBound game page")
    .addStringOption((o) => o.setName("slug").setDescription("Game slug").setRequired(true)),
  new SlashCommandBuilder()
    .setName("install")
    .setDescription("Open PlayBound install tab")
    .addStringOption((o) => o.setName("slug").setDescription("Game slug").setRequired(true)),
  new SlashCommandBuilder()
    .setName("servers")
    .setDescription("Open PlayBound servers for a game")
    .addStringOption((o) => o.setName("slug").setDescription("Game slug").setRequired(true)),
].map((c) => c.toJSON());

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log(`Registered guild slash commands for ${GUILD_ID}`);
  } catch (err) {
    console.error(
      "Slash command registration failed (bot stays up for channel provisioning):",
      err?.rawError || err?.message || err
    );
    console.error(
      "Re-invite with both bot + applications.commands scopes, e.g.\n" +
        `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=268446720&scope=bot%20applications.commands&guild_id=${GUILD_ID}`
    );
  }

  try {
    await provisionMissing();
  } catch (err) {
    console.error("Startup Discord backfill failed:", err?.message || err);
  }
});

client.on("error", (err) => {
  console.error("Discord client error:", err?.message || err);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const slug = interaction.options.getString("slug", true).toLowerCase();
  const game = await games.findOne({
    slug,
    $or: [{ status: "published" }, { published: true }],
  });
  if (!game) {
    await interaction.reply({ content: `No published game \`${slug}\` on PlayBound.`, ephemeral: true });
    return;
  }
  let path = `/games/${slug}`;
  if (interaction.commandName === "install") path += "/install";
  if (interaction.commandName === "servers") path = `/servers?game=${encodeURIComponent(slug)}`;
  await interaction.reply(`${game.title}: ${SITE_URL}${path}`);
});

function unauthorized(res) {
  res.writeHead(401);
  res.end("Unauthorized");
}

function requireSecret(req, res) {
  const auth = req.headers.authorization || "";
  if (!WEBHOOK_SECRET || auth !== `Bearer ${WEBHOOK_SECRET}`) {
    unauthorized(res);
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, backfillRunning }));
    return;
  }

  if (req.method === "POST" && req.url === "/provision") {
    if (!requireSecret(req, res)) return;
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { slug, action } = JSON.parse(body || "{}");
      if (action === "gotw") {
        await postGameOfTheWeek();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      }
      if (!slug) {
        res.writeHead(400);
        res.end("slug required");
        return;
      }
      const result = await provisionChannel(slug);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          playboundDiscord: result.playboundDiscord,
          created: result.created,
          layout: result.layout,
          editions: result.editions,
        })
      );
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/provision-all") {
    if (!requireSecret(req, res)) return;
    try {
      const result = await provisionMissing();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/reconcile") {
    if (!requireSecret(req, res)) return;
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { dryRun } = JSON.parse(body || "{}");
      const result = await reconcileChannels({ dryRun: Boolean(dryRun) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/announce-game") {
    if (!requireSecret(req, res)) return;
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const payload = JSON.parse(body || "{}");
      if (!payload.title && !payload.slug) {
        res.writeHead(400);
        res.end("title or slug required");
        return;
      }
      await announceNewCatalogGame(payload);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error("announce-game", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  // Temporary event voice (+ optional text) for Game Nights / tournaments.
  if (req.method === "POST" && req.url === "/events/voice") {
    if (!requireSecret(req, res)) return;
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { eventId, title, gameSlug } = JSON.parse(body || "{}");
      const guild = await client.guilds.fetch(GUILD_ID);
      // No dedicated category per event any more: an event with no game sits
      // in the shared Events category, and one with a game sits in that game's
      // area, the same way party channels are placed.
      const categoryId = await resolveEventCategoryId(guild, gameSlug);
      const voice = await guild.channels.create({
        name: eventVoiceChannelName(title, eventId),
        type: ChannelType.GuildVoice,
        parent: categoryId,
        reason: `PlayBound event voice ${eventId || ""}`,
      });
      const text = await guild.channels.create({
        name: eventTextChannelName(title, eventId),
        type: ChannelType.GuildText,
        parent: categoryId,
        reason: `PlayBound event text ${eventId || ""}`,
      });
      const invite = await voice.createInvite({
        maxAge: 0,
        maxUses: 0,
        reason: "PlayBound event invite",
      });
      await text.send({
        content: `**${title || "PlayBound Event"}** is gathering here.\nJoin voice: ${invite.url}\nEvent page: ${SITE_URL}/events/${eventId || ""}`,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          inviteUrl: invite.url,
          voiceChannelId: voice.id,
          textChannelId: text.id,
          categoryId,
        })
      );
    } catch (err) {
      console.error("events/voice", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/events/voice/cleanup") {
    if (!requireSecret(req, res)) return;
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { voiceChannelId, textChannelId, categoryId } = JSON.parse(body || "{}");
      const guild = await client.guilds.fetch(GUILD_ID);
      for (const id of [voiceChannelId, textChannelId]) {
        if (!id) continue;
        try {
          const ch = await guild.channels.fetch(id);
          if (ch) await ch.delete("PlayBound event cleanup");
        } catch (err) {
          console.warn("cleanup channel", id, err?.message || err);
        }
      }
      /*
       * Events now share the Events category and game categories with
       * everything else, so deleting the recorded category would take other
       * events' channels with it. Only the per-event categories the old flow
       * created are removed, and only once they are empty.
       */
      if (categoryId) {
        try {
          const cat = await guild.channels.fetch(String(categoryId));
          const stillUsed = cat?.children?.cache?.size > 0;
          if (cat && !stillUsed && !isSharedCategoryName(cat.name)) {
            await cat.delete("PlayBound event cleanup");
          }
        } catch (err) {
          console.warn("cleanup category", categoryId, err?.message || err);
        }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error("events/voice/cleanup", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  // Renaming an event renames its channels, the same way a party rename does.
  if (req.method === "POST" && req.url === "/events/voice/rename") {
    if (!requireSecret(req, res)) return;
    if (!client.isReady()) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Discord bot not ready" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { eventId, title, voiceChannelId, textChannelId } = JSON.parse(body || "{}");
      if (!voiceChannelId && !textChannelId) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "voiceChannelId or textChannelId required" }));
        return;
      }
      const guild = await client.guilds.fetch(GUILD_ID);
      const renamed = {};
      if (voiceChannelId) {
        const voice = await guild.channels.fetch(String(voiceChannelId)).catch(() => null);
        if (voice?.type === ChannelType.GuildVoice) {
          renamed.voice = eventVoiceChannelName(title, eventId);
          await voice.setName(renamed.voice, "PlayBound event rename");
        }
      }
      if (textChannelId) {
        const text = await guild.channels.fetch(String(textChannelId)).catch(() => null);
        if (text?.type === ChannelType.GuildText) {
          renamed.text = eventTextChannelName(title, eventId);
          await text.setName(renamed.text, "PlayBound event rename");
        }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, ...renamed }));
    } catch (err) {
      console.error("events/voice/rename", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  // Picking (or clearing) an event's game moves its channels to that area.
  if (req.method === "POST" && req.url === "/events/voice/place") {
    if (!requireSecret(req, res)) return;
    if (!client.isReady()) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Discord bot not ready" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { gameSlug, voiceChannelId, textChannelId } = JSON.parse(body || "{}");
      if (!voiceChannelId && !textChannelId) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "voiceChannelId or textChannelId required" }));
        return;
      }
      const guild = await client.guilds.fetch(GUILD_ID);
      const categoryId = await resolveEventCategoryId(guild, gameSlug);
      for (const id of [voiceChannelId, textChannelId]) {
        if (!id) continue;
        const ch = await guild.channels.fetch(String(id)).catch(() => null);
        if (!ch || ch.parentId === categoryId) continue;
        await ch.setParent(categoryId, { reason: "PlayBound event moved to game area" });
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, categoryId }));
    } catch (err) {
      console.error("events/voice/place", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  // ── Phase 4: Temporary party voice channels ──────────────────────────
  if (req.method === "POST" && req.url === "/parties/voice") {
    if (!requireSecret(req, res)) return;
    if (!client.isReady()) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Discord bot not ready" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const {
        partyId,
        gameSlug,
        name,
        existingVoiceChannelId,
      } = JSON.parse(body || "{}");
      const guild = await client.guilds.fetch(GUILD_ID);
      const category = await ensureCategory(guild, "PlayBound Parties");

      const reuse = async (id, type) => {
        if (!id) return null;
        const ch = await guild.channels.fetch(String(id)).catch(() => null);
        return ch && ch.type === type ? ch : null;
      };

      const voice =
        (await reuse(existingVoiceChannelId, ChannelType.GuildVoice)) ||
        (await guild.channels.create({
          name: partyVoiceChannelName(name || gameSlug, partyId),
          type: ChannelType.GuildVoice,
          parent: category.id,
          reason: `PlayBound party voice ${partyId || ""}`,
        }));

      const invite = await voice.createInvite({
        maxAge: 0,
        maxUses: 0,
        reason: "PlayBound party invite",
      });

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          inviteUrl: invite.url,
          voiceChannelId: voice.id,
          categoryId: category.id,
        })
      );
    } catch (err) {
      console.error("parties/voice", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/parties/voice/move") {
    if (!requireSecret(req, res)) return;
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { voiceChannelId, discordUserIds } = JSON.parse(body || "{}");
      const ids = Array.isArray(discordUserIds) ? discordUserIds.map(String) : [];
      if (!voiceChannelId || ids.length === 0) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "voiceChannelId and discordUserIds required" }));
        return;
      }
      const guild = await client.guilds.fetch(GUILD_ID);
      const channel = await guild.channels.fetch(String(voiceChannelId));
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Voice channel not found" }));
        return;
      }
      let moved = 0;
      for (const id of ids) {
        try {
          const member = await guild.members.fetch(id);
          if (member.voice?.channelId && member.voice.channelId !== channel.id) {
            await member.voice.setChannel(channel.id, "PlayBound party voice");
            moved += 1;
          }
        } catch (err) {
          console.warn("party voice move", id, err?.message || err);
        }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, moved, guildId: GUILD_ID }));
    } catch (err) {
      console.error("parties/voice/move", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/parties/voice/rename") {
    if (!requireSecret(req, res)) return;
    if (!client.isReady()) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Discord bot not ready" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { voiceChannelId, name } = JSON.parse(body || "{}");
      if (!voiceChannelId) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "voiceChannelId required" }));
        return;
      }
      const guild = await client.guilds.fetch(GUILD_ID);
      const channel = await guild.channels.fetch(String(voiceChannelId));
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Voice channel not found" }));
        return;
      }
      const nextName = partyVoiceChannelName(name, voiceChannelId);
      await channel.setName(nextName, "PlayBound party rename");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, name: nextName }));
    } catch (err) {
      console.error("parties/voice/rename", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/parties/voice/place") {
    if (!requireSecret(req, res)) return;
    if (!client.isReady()) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Discord bot not ready" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { voiceChannelId, gameSlug } = JSON.parse(body || "{}");
      if (!voiceChannelId) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "voiceChannelId required" }));
        return;
      }
      const guild = await client.guilds.fetch(GUILD_ID);
      const voice = await guild.channels.fetch(String(voiceChannelId));
      if (!voice || voice.type !== ChannelType.GuildVoice) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Voice channel not found" }));
        return;
      }
      const slug = String(gameSlug || "").trim();
      const categoryId =
        (await resolveGameCategoryId(guild, slug)) ||
        (await ensureCategory(guild, categoryNameForSlug(slug || "a"))).id;
      await voice.setParent(categoryId, { reason: "PlayBound party under game category" });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, categoryId }));
    } catch (err) {
      console.error("parties/voice/place", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/parties/voice/cleanup") {
    if (!requireSecret(req, res)) return;
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { voiceChannelId } = JSON.parse(body || "{}");
      if (voiceChannelId) {
        const guild = await client.guilds.fetch(GUILD_ID);
        try {
          const ch = await guild.channels.fetch(String(voiceChannelId));
          if (ch) await ch.delete("PlayBound party cleanup");
        } catch (err) {
          console.warn("party cleanup channel", voiceChannelId, err?.message || err);
        }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error("parties/voice/cleanup", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }
        content: textBody,
        allowedMentions: { parse: [] },
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          message: {
            id: sent.id,
            content: sent.content || textBody,
            username: sent.author?.username || username || "Player",
            avatarUrl: sent.author?.displayAvatarURL?.({ size: 64 }) || avatarUrl || null,
            createdAt: sent.createdAt?.toISOString?.() || new Date().toISOString(),
            bot: true,
          },
        })
      );
    } catch (err) {
      console.error("parties/chat/send", err);
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

await mongo.connect();
games = mongo.db().collection("cataloggames");
editions = mongo.db().collection("editions");
await client.login(TOKEN);
server.listen(PORT, () => console.log(`Webhook listening on :${PORT}`));
