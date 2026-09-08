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
 * - Single-edition / no editions: #slug under a GAME CHANNELS letter bucket
 * - Multi-edition games (2+ public active editions):
 *     Category named after the game title
 *       #general          ← game-level invite (stored on cataloggames)
 *       #edition-slug …   ← one channel per public active edition
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * Letter bucket for a game's channel.
 *
 * Six buckets rather than two because Discord caps a category at 50 channels,
 * and N–Z had reached it: every move into it failed with
 * CHANNEL_PARENT_MAX_CHANNELS, so games could not be placed at all and the
 * failure looked like the layout logic misbehaving.
 *
 * The ranges are uneven on purpose — they are balanced against the catalog's
 * actual first-letter distribution, not the alphabet. Across all 193 games
 * the largest bucket is 44, and only about 107 are published, so there is
 * room to roughly double before this needs splitting again.
 *
 * Digits sort below "a", so numeric slugs land in the first bucket.
 */
function categoryNameForSlug(slug) {
  const ch = (String(slug || "")[0] || "a").toLowerCase();
  if (ch < "d") return "GAME CHANNELS — 0–C";
  if (ch < "h") return "GAME CHANNELS — D–G";
  if (ch < "n") return "GAME CHANNELS — H–M";
  if (ch < "s") return "GAME CHANNELS — N–R";
  if (ch < "u") return "GAME CHANNELS — S–T";
  return "GAME CHANNELS — U–Z";
}

/** Discord's hard cap on channels in one category. */
const CATEGORY_CHANNEL_LIMIT = 50;

/**
 * Channels that should not exist, deleted wherever they sit.
 *
 * Duplicates left by earlier layouts and edition slugs. These are in shared
 * letter buckets, so the redundant-name sweep — which only looks inside game
 * categories — never reached them.
 */
const RETIRED_CHANNEL_NAMES = new Set([
  "re-volt-online",
  "rvgl-original",
  "rvgl-online",
  "gemini-gold-unix",
]);

/**
 * True when a category is the right home for this slug.
 *
 * Accepts the overflow spills too, otherwise a channel sitting in
 * "… S–T (2)" reads as misplaced and both provisioning and the daily
 * reconcile would move it back and forth forever.
 */
function isBucketFor(categoryName, slug) {
  const base = categoryNameForSlug(slug);
  const name = String(categoryName || "");
  return name === base || name.startsWith(`${base} (`);
}

/**
 * The bucket to put this game's channel in, spilling when one fills up.
 *
 * Rebalancing the ranges bought headroom but does not scale: the catalog
 * keeps growing and any fixed set of ranges eventually hits the 50-channel
 * cap again, which is what stranded Re-Volt — every move into a full N–Z
 * failed and the game simply could not be placed.
 *
 * So overflow instead of re-ranging. "… S–T" fills, "… S–T (2)" is created
 * and used, and so on. Nothing has to be re-tuned by hand as the catalog
 * doubles, and existing channels never move just because a neighbour spilled.
 */
async function bucketCategoryFor(guild, slug) {
  const base = categoryNameForSlug(slug);
  for (let i = 1; i <= 20; i++) {
    const name = i === 1 ? base : `${base} (${i})`;
    const cat = await ensureCategory(guild, name);
    const used = guild.channels.cache.filter((c) => c && c.parentId === cat.id).size;
    if (used < CATEGORY_CHANNEL_LIMIT) return cat;
  }
  /* 20 full spills of one letter range is not overflow, it is a bug. */
  throw new Error(`No room in any "${base}" category`);
}

/** Discord channel names: lowercase, a–z 0–9 hyphen, max 90. */
function discordChannelName(raw) {
  const str = String(raw || "channel").toLowerCase().trim();
  if (str === "the-elder-scrolls-iii-morrowind" || str === "morrowind") {
    return "openmw";
  }
  /* The engine suffix means nothing to a player looking for the Re-Volt room. */
  if (str === "re-volt-rvgl") {
    return "re-volt";
  }
  return (
    str
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 90) || "channel"
  );
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

function formatGameNightTitle(raw) {
  let title = String(raw || "").trim();
  title = title.replace(/^[⚡📅🎮\s]+/, "");
  title = title.replace(/^Pop-Up\s*(Game\s*Night:\s*)?/i, "");
  title = title.replace(/^Game\s*Night:\s*/i, "");
  if (!title.toLowerCase().includes("game night")) {
    title = `${title} Game Night`;
  }
  return title.trim();
}

function eventVoiceChannelName(raw, fallbackId) {
  const formatted = formatGameNightTitle(raw);
  return `🔊 ${formatted}`.slice(0, 90);
}

function eventTextChannelName(raw, fallbackId) {
  const formatted = formatGameNightTitle(raw);
  const slugified = formatted
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `💬-${slugified || "event"}`.slice(0, 90);
}

/** Category a temporary channel belongs under: the Event Rooms category. */
const EVENTS_CATEGORY_NAME = "Event Rooms";

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
 * Event channels always live in the shared Event Rooms category.
 */
async function resolveEventCategoryId(guild, _gameSlug) {
  // If an existing category is called "EVENTS" or "Events", rename it to "Event Rooms" for seamless migration
  const existingOld = guild.channels.cache.find(
    (c) => c && c.type === ChannelType.GuildCategory && (c.name === "EVENTS" || c.name === "Events")
  );
  const existingNew = guild.channels.cache.find(
    (c) => c && c.type === ChannelType.GuildCategory && c.name === EVENTS_CATEGORY_NAME
  );
  if (!existingNew && existingOld) {
    try {
      await existingOld.setName(EVENTS_CATEGORY_NAME, "Migrate category name to Event Rooms");
      return existingOld.id;
    } catch (err) {
      console.warn("Could not rename existing Events category:", err?.message || err);
    }
  }
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
    n === "Event Rooms" ||
    n === "EVENTS" ||
    n === "Events" ||
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

const SINGLE_CHANNEL_GAMES = new Set([
  "war-thunder",
  "genshin-impact",
  "league-of-legends",
  "openlara",
  "triplea",
  "privateer-gemini-gold",
  "trigger-rally",
  /*
   * Editions here are ways of installing the same game, not places with
   * separate populations. Re-Volt's soundtrack and online editions were each
   * given a channel and all three sat empty next to one another; Ur-Quan
   * Masters' HD build is the same story. One room, one conversation.
   */
  "re-volt-rvgl",
  "the-ur-quan-masters",
]);

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

function getExcludedEditionSlugs() {
  try {
    const filePath = path.join(_dirname, "../discord-exclusions.json");
    if (fs.existsSync(filePath)) {
      return new Set(JSON.parse(fs.readFileSync(filePath, "utf-8")));
    }
  } catch (e) {
    console.error("Failed to read discord-exclusions.json", e);
  }
  return new Set();
}

function isExcludedEdition(edition) {
  if (!edition) return false;
  const gameSlug = String(edition.gameSlug || "").toLowerCase().trim();
  if (SINGLE_CHANNEL_GAMES.has(gameSlug)) return true;

  const slug = String(edition.slug || "").toLowerCase().trim();
  
  if (getExcludedEditionSlugs().has(slug)) return true;

  const name = String(edition.name || "").toLowerCase().trim();

  // If it's OpenMW or KeeperFX or Daggerfall Unity or a custom server, do not exclude
  if (
    slug === "openmw" ||
    slug === "keeperfx" ||
    slug === "daggerfall-unity" ||
    slug === "turtle-wow" ||
    slug === "project-1999" ||
    slug === "project-quarm"
  ) {
    return false;
  }

  // Common store, client, platform, or default/official installer slugs and names
  const storeOrClientPatterns = [
    "official",
    "base",
    "base-game",
    "default",
    "steam",
    "steam-edition",
    "steam-release",
    "gog",
    "gog-edition",
    "epic",
    "epic-games",
    "gaijin",
    "gaijin-client",
    "gaijin-launcher",
    "hoyoplay",
    "genshin-pc-hoyoplay",
    "genshin-epic",
    "desktop-native",
    "web-wasm",
    "trigger-rally-portable",
    "trigger-rally-web",
    "portable",
    "standalone",
    "windows",
    "mac",
    "macos",
    "linux",
    "web",
    "browser",
    "direct-download",
    "riot",
    "riot-client",
  ];

  if (storeOrClientPatterns.includes(slug)) return true;

  if (
    slug.endsWith("-client") ||
    slug.endsWith("-launcher") ||
    slug.endsWith("-installer") ||
    slug.endsWith("-portable") ||
    slug.endsWith("-mac") ||
    slug.endsWith("-windows") ||
    slug.endsWith("-linux") ||
    slug.endsWith("-web") ||
    slug.startsWith("steam-") ||
    slug.startsWith("epic-") ||
    slug.startsWith("gog-") ||
    slug.startsWith("gaijin-")
  ) {
    return true;
  }

  if (
    name.includes("steam") ||
    name.includes("gog") ||
    name.includes("epic") ||
    name.includes("gaijin") ||
    name.includes("hoyoplay") ||
    name.includes("standalone") ||
    name.includes("portable") ||
    name.includes("official") ||
    name.includes("base game") ||
    name.includes("default") ||
    name.includes("mac client") ||
    name.includes("windows client") ||
    name.includes("browser edition") ||
    name.includes("webassembly") ||
    name.includes("desktop native")
  ) {
    return true;
  }

  return edition.isDefault === true;
}

async function listPublicEditions(gameSlug) {
  const all = await editions
    .find({
      gameSlug,
      visibility: "public",
      status: "active",
    })
    .project({
      /*
       * isExcludedEdition reads gameSlug to apply SINGLE_CHANNEL_GAMES, and
       * this projection did not select it — so that check ran as has("") and
       * never matched. Everything on that list was really being excluded by
       * the name patterns or discord-exclusions.json, and any game whose
       * edition slugs looked like neither still got a channel each.
       */
      gameSlug: 1,
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
 * Flat layout: #slug under its letter bucket (games with no custom editions).
 */
async function provisionFlatChannel(guild, game) {
  const slug = game.slug;
  const channelName = discordChannelName(slug);
  const existingId = game.communityLinks?.playboundDiscord?.channelId;
  const cat = await bucketCategoryFor(guild, slug);
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

/**
 * Order the categories themselves, with PlayBound Parties pinned last.
 *
 * ensureCategory creates a new category at `categories.length + 10`, i.e. the
 * bottom — fine when one appears occasionally, wrong when six letter buckets
 * are introduced at once and all land underneath PlayBound Parties.
 *
 * Sorting here and pinning Parties in the same pass is what makes this safe:
 * the two used to be separate, so anything that sorted categories would have
 * fought ensurePartiesCategoryAtBottom on every run.
 */
async function sortCategories(guild) {
  const channels = await guild.channels.fetch();
  const categories = [...channels.values()].filter(
    (c) => c && c.type === ChannelType.GuildCategory
  );
  if (categories.length < 2) return;

  /*
   * Four bands, then alphabetical inside each.
   *
   * Plain alphabetical put the hub and Event Rooms wherever their letters
   * landed, in among the games. The game band deliberately mixes franchise
   * categories with the "GAME CHANNELS — …" letter buckets: sorting them
   * together is what the reader wants, since a bucket is just a group of
   * games that had no franchise of their own.
   *
   * PlayBound Parties is matched before the PlayBound prefix so the hub rule
   * cannot claim it and drag it to the top.
   */
  const norm = (name) => String(name || "").trim().toLowerCase();
  /*
   * Pinned by exact name, not by prefix.
   *
   * This was /^playbound\b/i, except the \b was written as a literal
   * backspace (0x08) rather than a word boundary, so the test could never
   * match anything and the hub category sorted as though it were a game —
   * which is exactly what kept dragging it out of first place.
   *
   * Exact names avoid the whole class of problem: "Playbound" and
   * "PlayBound Parties" share a first word, so a prefix rule only keeps
   * them apart while the tests stay in this order. Comparing trimmed
   * lowercase names also means casing or a stray space cannot defeat the
   * pin.
   */
  const PINNED_TOP = ["playbound"];
  const PINNED_BOTTOM = ["playbound parties"];

  const rank = (name) => {
    const n = norm(name);
    if (PINNED_BOTTOM.includes(n)) return 3;
    if (PINNED_TOP.includes(n)) return 0;
    if (n === norm(EVENTS_CATEGORY_NAME) || n.startsWith("event")) return 1;
    return 2;
  };

  /*
   * Sort a letter bucket by the letters it holds, not by its label.
   *
   * Every bucket is called "GAME CHANNELS — …", so sorting on the raw name
   * files all of them under G — which puts the 0–C games after Freeciv and
   * before Hedgewars, i.e. not alphabetical at all from the reader's side.
   * Using the range start slots each bucket where its contents belong.
   */
  const sortKey = (name) => {
    const range = /^GAME CHANNELS\s*[—-]\s*(.)/.exec(name);
    return range ? range[1] : name;
  };

  const ordered = [...categories].sort((a, b) => {
    const byRank = rank(a.name) - rank(b.name);
    if (byRank !== 0) return byRank;
    const byKey = sortKey(a.name).localeCompare(sortKey(b.name), "en");
    // Same key means a bucket and a game that starts with that letter, or a
    // spill bucket beside its parent — fall back to the full name.
    return byKey !== 0 ? byKey : a.name.localeCompare(b.name, "en");
  });
  const updates = [];
  ordered.forEach((cat, index) => {
    if (cat.position !== index) updates.push({ channel: cat.id, position: index });
  });
  if (!updates.length) return;

  console.log(`[sort] Reordering ${updates.length} categor(y/ies)`);
  await guild.channels
    .setPositions(updates)
    .catch((err) => console.warn("[sort] Failed to reorder categories:", err?.message || err));
}

/**
 * Order text channels alphabetically inside every category.
 *
 * Discord orders by an explicit position, so channels otherwise sit in
 * creation order and a guild slowly becomes unscannable.
 */
async function sortChannelsAlphabetically(guild) {
  const channels = await guild.channels.fetch();
  const categories = [...channels.values()].filter(
    (c) => c && c.type === ChannelType.GuildCategory
  );

  const updates = [];
  for (const cat of categories) {
    const children = [...channels.values()]
      .filter((c) => c && c.parentId === cat.id && c.type === ChannelType.GuildText)
      .sort((a, b) => a.name.localeCompare(b.name, "en"));

    children.forEach((channel, index) => {
      // Only ask Discord for the moves that actually change something.
      if (channel.position !== index) updates.push({ channel: channel.id, position: index });
    });
  }

  if (!updates.length) return;
  console.log(`[sort] Alphabetising ${updates.length} channel(s)`);
  await guild.channels.setPositions(updates).catch((err) => {
    console.warn("[sort] Failed to alphabetise channels:", err?.message || err);
  });
}

async function cleanupRedundantChannels(guild) {
  await cleanupArchiveSection(guild);

  const serverGeneral = await findServerGeneral(guild);
  const channels = await guild.channels.fetch();

  for (const channel of channels.values()) {
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    if (serverGeneral && channel.id === serverGeneral.id) continue;

    /*
     * Checked before the parent guard below, which skips anything already in a
     * shared letter bucket. These strays are sitting in one, so the guard is
     * exactly what kept them alive. The game's own channel is never listed —
     * #re-volt-rvgl gets renamed to #re-volt by the reconcile pass, which
     * keeps its history; deleting it would throw the room away and build a
     * new one.
     */
    if (RETIRED_CHANNEL_NAMES.has(channel.name)) {
      console.log(`[cleanup] Deleting retired channel #${channel.name}`);
      await channel
        .delete("PlayBound cleanup: retired duplicate channel")
        .catch((err) =>
          console.warn(`[cleanup] Failed to delete #${channel.name}:`, err?.message || err)
        );
      await sleep(PROVISION_DELAY_MS);
      continue;
    }

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
      channel.name === "epic" ||
      channel.name === "gaijin-client" ||
      channel.name === "gaijin-launcher" ||
      channel.name === "genshin-pc-hoyoplay" ||
      channel.name === "genshin-epic" ||
      channel.name === "desktop-native" ||
      channel.name === "web-wasm" ||
      channel.name === "trigger-rally-portable" ||
      channel.name === "trigger-rally-web" ||
      channel.name.endsWith("-client") ||
      channel.name.endsWith("-launcher") ||
      channel.name.endsWith("-installer") ||
      channel.name.endsWith("-portable")
    ) {
      console.log(`[cleanup] Deleting redundant #${channel.name} in category "${parent.name}"`);
      await channel.delete("PlayBound cleanup: redundant installer/client channel").catch((err) => {
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

async function gameNeedsProvision(game, guild) {
  const publicEds = await listPublicEditions(game.slug);
  const mainChannelName = discordChannelName(game.slug);
  if (publicEds.length >= 1) {
    const hasMain = Boolean(game.communityLinks?.playboundDiscord?.channelId);
    const edsMissing = publicEds.some((e) => !e.playboundDiscord?.channelId);
    return !hasMain || edsMissing;
  }

  const channelId = game.communityLinks?.playboundDiscord?.channelId;
  if (!channelId) return true;
  if (!guild) return false;

  /*
   * A stored id was treated as "done", whatever state the channel was in.
   *
   * That is why Re-Volt and Privateer never moved: both had an id, so they
   * were skipped on every sweep and provisionFlatChannel — the thing that
   * puts a channel in its letter bucket — never ran for them. A channel that
   * has been deleted, or that is sitting in the wrong place or under no
   * category at all, still needs provisioning.
   */
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return true;
  if (channel.name !== mainChannelName) return true;

  const parent = channel.parentId ? guild.channels.cache.get(channel.parentId) : null;
  return !isBucketFor(parent?.name, game.slug);
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
      if (await gameNeedsProvision(doc, guild)) needs.push(doc);
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
    /*
     * Sort last, once every channel is where it is going to stay.
     *
     * This used to run at the end of cleanup, which is before provisioning
     * re-parents anything — so a channel adopted into a letter bucket landed
     * wherever Discord put it and the guild looked unsorted despite the pass
     * having "run".
     */
    await sortCategories(guild);
    await sortChannelsAlphabetically(guild);
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
    franchise,
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
        /*
         * A flat game is in the right place if it is in any spill of its
         * bucket. Comparing against the base name alone would haul every
         * channel out of "… (2)" each night, only for provisioning to spill
         * it straight back.
         */
        const placed = want.franchise
          ? parent?.name === want.category
          : isBucketFor(parent?.name, game.slug);
        if (!placed) {
          moved.push({
            slug: game.slug,
            from: parent?.name || "(none)",
            to: want.category,
          });
          if (!dryRun) {
            const cat = want.franchise
              ? await ensureCategory(guild, want.category)
              : await bucketCategoryFor(guild, game.slug);
            await channel.setParent(cat.id, { lockPermissions: false });
            await sleep(PROVISION_DELAY_MS);
          }
        }

        /*
         * Edition channels were never placed by anything.
         *
         * provisionFranchise parents them when it creates them, and nothing
         * revisits them afterwards — this loop only ever considered a game's
         * own channel. So #exult and #keeperfx sat in a letter bucket from an
         * older layout, which also kept that bucket alive and non-empty long
         * after every game had left it.
         */
        if (want.franchise) {
          for (const ed of await listPublicEditions(game.slug)) {
            const edName = discordChannelName(ed.slug);
            const edChannel =
              (ed.playboundDiscord?.channelId
                ? guild.channels.cache.get(ed.playboundDiscord.channelId)
                : null) ||
              guild.channels.cache.find(
                (c) => c && c.type === ChannelType.GuildText && c.name === edName
              );
            if (!edChannel || edChannel.type !== ChannelType.GuildText) continue;

            const edParent = edChannel.parentId
              ? guild.channels.cache.get(edChannel.parentId)
              : null;
            if (edParent?.name === want.category) continue;

            moved.push({
              slug: ed.slug,
              from: edParent?.name || "(none)",
              to: want.category,
            });
            if (!dryRun) {
              const cat = await ensureCategory(guild, want.category);
              await edChannel.setParent(cat.id, { lockPermissions: false });
              await sleep(PROVISION_DELAY_MS);
            }
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
    n.startsWith("PlayBound —") ||
    n === "Event Rooms" ||
    n === "EVENTS" ||
    n === "Events"
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

/** Server #events — dedicated channel for scheduled events and pop-up game nights. */
async function ensureEventsChannel(guild) {
  const configured = process.env.DISCORD_EVENTS_CHANNEL_ID;
  if (configured) {
    const ch = await guild.channels.fetch(configured).catch(() => null);
    if (ch?.isTextBased()) return ch;
  }
  await guild.channels.fetch();
  const allText = [...guild.channels.cache.values()].filter(
    (c) => c && c.type === ChannelType.GuildText
  );

  // 1. Exact match for "events"
  const exact = allText.filter((c) => c.name.toLowerCase() === "events");
  const preferredExact = exact.find((c) => !isGameOrEventCategoryName(c.parent?.name));
  if (preferredExact) return preferredExact;
  if (exact[0]) return exact[0];

  // 2. Fuzzy match for channels with "event" in name (e.g. 📅-events, game-events, event-announcements)
  const fuzzy = allText.filter(
    (c) =>
      c.name.toLowerCase().includes("event") &&
      !c.name.toLowerCase().includes("general") &&
      !isGameOrEventCategoryName(c.parent?.name)
  );
  if (fuzzy[0]) return fuzzy[0];

  try {
    return await guild.channels.create({
      name: "events",
      type: ChannelType.GuildText,
      reason: "PlayBound events announcement channel",
    });
  } catch (err) {
    console.warn("ensureEventsChannel create failed:", err?.message || err);
    return null;
  }
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

async function syncEventChannelsOnStartup(guild) {
  try {
    const channels = await guild.channels.fetch();
    const existingOld = channels.find(
      (c) => c && c.type === ChannelType.GuildCategory && c.name.toLowerCase() === "events"
    );
    const existingNew = channels.find(
      (c) => c && c.type === ChannelType.GuildCategory && c.name === EVENTS_CATEGORY_NAME
    );

    if (!existingNew && existingOld) {
      console.log(`[events] Renaming existing category "${existingOld.name}" -> "${EVENTS_CATEGORY_NAME}"`);
      await existingOld.setName(EVENTS_CATEGORY_NAME, "Migrate category name to Event Rooms");
    } else if (!existingNew && !existingOld) {
      console.log(`[events] Creating category "${EVENTS_CATEGORY_NAME}"`);
      await ensureCategory(guild, EVENTS_CATEGORY_NAME);
    }

    const eventsCh = await ensureEventsChannel(guild);
    if (eventsCh) {
      console.log(`[events] Found/ensured #${eventsCh.name} channel (id: ${eventsCh.id})`);
    }
  } catch (err) {
    console.warn("[events] Startup event channels sync warning:", err?.message || err);
  }
}

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
    const guild = await client.guilds.fetch(GUILD_ID);
    if (guild) {
      await syncEventChannelsOnStartup(guild);
    }
  } catch (err) {
    console.warn("Startup event channels sync error:", err?.message || err);
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
    /*
     * Answer immediately and sweep in the background.
     *
     * This used to await provisionMissing() before responding, and the caller
     * aborts at 12s — but a full sweep rate-limits itself with 1.5s between
     * destructive calls and walks every published game, so it takes minutes.
     * The work completed; the admin just always saw "This operation was
     * aborted" and had no idea whether anything had happened.
     *
     * backfillRunning already makes concurrent sweeps a no-op, and it is
     * reset in a finally, so a failed run cannot wedge the endpoint.
     */
    if (backfillRunning) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, started: false, note: "already running" }));
      return;
    }

    provisionMissing()
      .then((result) => {
        console.log(
          `[provision-all] finished: provisioned=${result.provisioned.length} ` +
            `linked=${result.skipped.length} failed=${result.failed.length}`
        );
      })
      .catch((err) => {
        console.error("[provision-all] sweep failed:", err?.message || err);
      });

    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: true, started: true }));
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

      // Post gathering announcement into the server #events channel
      try {
        const eventsChannel = await ensureEventsChannel(guild);
        if (eventsChannel?.isTextBased()) {
          const eventUrl = `${SITE_URL}/events/${eventId || ""}`;
          let coverImage = null;
          if (gameSlug && games) {
            try {
              const g = await games.findOne({ slug: String(gameSlug).trim() });
              if (g?.coverImage) coverImage = g.coverImage;
            } catch {}
          }
          const embed = new EmbedBuilder()
            .setColor(0x3b82f6)
            .setTitle(`🎮 ${title || "PlayBound Event"}`)
            .setURL(eventUrl)
            .setDescription(
              `An event room is now open!\n\n` +
              `🔊 **Voice Room:** ${invite.url}\n` +
              `💬 **Chat Room:** <#${text.id}>\n\n` +
              `🎟️ **[Join Event & Details](${eventUrl})**`
            )
            .setFooter({ text: "PlayBound Event Planner" })
            .setTimestamp();

          if (coverImage) {
            embed.setThumbnail(coverImage.startsWith("http") ? coverImage : `${SITE_URL}${coverImage}`);
          }

          await eventsChannel.send({
            content: `**${title || "PlayBound Event"}** is gathering now in <#${text.id}>!`,
            embeds: [embed],
          });
        }
      } catch (postErr) {
        console.warn("Failed to post event to #events channel:", postErr?.message || postErr);
      }

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

  // Post event announcement directly to the server #events channel
  if (req.method === "POST" && (req.url === "/events/announce" || req.url === "/events/webhook")) {
    if (!requireSecret(req, res)) return;
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const payload = JSON.parse(body || "{}");
      const guild = await client.guilds.fetch(GUILD_ID);
      const eventsChannel = await ensureEventsChannel(guild);
      if (!eventsChannel?.isTextBased()) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Could not find or create #events channel" }));
        return;
      }

      const sendOptions = {};
      if (payload.content) sendOptions.content = payload.content;
      if (Array.isArray(payload.embeds) && payload.embeds.length > 0) {
        sendOptions.embeds = payload.embeds;
      } else if (payload.embed) {
        sendOptions.embeds = [payload.embed];
      } else if (payload.title) {
        const embed = new EmbedBuilder()
          .setColor(0x3b82f6)
          .setTitle(String(payload.title).slice(0, 256))
          .setURL(payload.url || (payload.eventId ? `${SITE_URL}/events/${payload.eventId}` : `${SITE_URL}/events`))
          .setDescription(String(payload.description || "A community event is scheduled!").slice(0, 4000))
          .setFooter({ text: "PlayBound Event Planner" })
          .setTimestamp();
        if (payload.imageUrl || payload.coverImage) {
          const img = payload.imageUrl || payload.coverImage;
          embed.setThumbnail(img.startsWith("http") ? img : `${SITE_URL}${img}`);
        }
        sendOptions.embeds = [embed];
      }

      if (Array.isArray(payload.components) && payload.components.length > 0) {
        sendOptions.components = payload.components;
      }

      if (!sendOptions.content && (!sendOptions.embeds || sendOptions.embeds.length === 0)) {
        sendOptions.content = `**${payload.title || "PlayBound Event"}** has been scheduled!`;
      }

      const msg = await eventsChannel.send(sendOptions);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, messageId: msg.id, channelId: eventsChannel.id }));
    } catch (err) {
      console.error("events/announce", err);
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

      /*
       * Guarantee the party can actually talk.
       *
       * The channel inherits its permissions from the PlayBound Parties
       * category, and nothing here ever set any — so if @everyone is denied
       * Speak at guild or category level, every member lands in the channel
       * muted. That is what was happening: people could Connect fine and
       * arrived unable to say anything.
       *
       * Granting Speak on the channel itself overrides the inherited deny for
       * this channel only, which is the narrowest place to put it. A party
       * voice room where nobody may speak has no purpose, so this is the one
       * permission worth asserting rather than inheriting.
       *
       * Applied after the reuse branch as well, so channels created before
       * this are repaired rather than staying silently broken. Non-fatal: if
       * the bot lacks Manage Roles the room is still usable by anyone the
       * server does allow to speak, and a warning is better than no channel.
       */
      try {
        await voice.permissionOverwrites.edit(
          guild.roles.everyone,
          { Speak: true },
          { reason: "PlayBound party voice — members must be able to speak" }
        );
      } catch (err) {
        console.warn("party voice speak overwrite", err?.message || err);
      }

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
      /*
       * Three outcomes, not two.
       *
       * This counted only members it actually relocated, so somebody already
       * sitting in the party's channel came back as moved:0 — the same answer
       * as "could not move them". The caller reads that as failure and sends a
       * Discord invite to a person who is already in the room.
       *
       * Not in voice at all is the genuinely different case: Discord will not
       * pull a member into a channel they are not connected to, so an invite
       * really is the only way to reach them. Separating the three lets the
       * caller tell "you are already here" from "here is how to get here".
       */
      let moved = 0;
      let alreadyThere = 0;
      let notInVoice = 0;
      for (const id of ids) {
        try {
          const member = await guild.members.fetch(id);
          const currentId = member.voice?.channelId || null;
          if (!currentId) {
            notInVoice += 1;
            continue;
          }
          if (currentId === channel.id) {
            alreadyThere += 1;
            continue;
          }
          await member.voice.setChannel(channel.id, "PlayBound party voice");
          moved += 1;
        } catch (err) {
          console.warn("party voice move", id, err?.message || err);
        }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ success: true, moved, alreadyThere, notInVoice, guildId: GUILD_ID })
      );
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

  if (req.method === "POST" && req.url === "/parties/chat/send") {
    if (!requireSecret(req, res)) return;
    if (!client.isReady()) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Discord bot not ready" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const { textChannelId, username, avatarUrl, content } = JSON.parse(body || "{}");
      const textBody = String(content || "").trim().slice(0, 500);
      if (!textChannelId || !textBody) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "textChannelId and content required" }));
        return;
      }
      const guild = await client.guilds.fetch(GUILD_ID);
      const text = await guild.channels.fetch(String(textChannelId));
      if (!text || text.type !== ChannelType.GuildText) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Text channel not found" }));
        return;
      }
      const hooks = await text.fetchWebhooks();
      let webhook = hooks.find((w) => w.owner?.id === client.user.id);
      if (!webhook) {
        webhook = await text.createWebhook({
          name: "PlayBound",
          reason: "PlayBound party chat",
        });
      }
      const sent = await webhook.send({
        username: String(username || "Player").slice(0, 80),
        avatarURL: typeof avatarUrl === "string" && avatarUrl.startsWith("http") ? avatarUrl : undefined,
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
