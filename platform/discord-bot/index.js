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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
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

async function ensureCategory(guild, name) {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === name
  );
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

async function listPublicEditions(gameSlug) {
  return editions
    .find({
      gameSlug,
      visibility: "public",
      status: "active",
    })
    .project({
      slug: 1,
      name: 1,
      playboundDiscord: 1,
      sortOrder: 1,
    })
    .sort({ sortOrder: 1, name: 1 })
    .toArray();
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
 * Flat layout: #slug under A–M / N–Z letter bucket (games with <2 public editions).
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
 * Franchise layout: Category(title) → #general + #edition-slug…
 */
async function provisionFranchise(guild, game, publicEditions) {
  const slug = game.slug;
  const cat = await ensureCategory(guild, franchiseCategoryName(game.title));
  const topic = `${game.title} on PlayBound — ${SITE_URL}/games/${slug}`;

  // Prefer stored id; also adopt a legacy flat #slug channel as #general.
  let generalPreferredId = game.communityLinks?.playboundDiscord?.channelId || null;
  const legacyFlat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === discordChannelName(slug)
  );
  const alsoAdoptIds = [];
  if (legacyFlat && legacyFlat.id !== generalPreferredId) {
    alsoAdoptIds.push(legacyFlat.id);
  }

  const generalResult = await ensureTextChannel(guild, {
    preferredId: generalPreferredId,
    name: "general",
    parentId: cat.id,
    topic,
    alsoAdoptIds,
  });

  const generalInvite = await inviteFor(generalResult.channel);
  if (generalResult.created) {
    const msg = await generalResult.channel.send(welcomeBody(game));
    await msg.pin().catch(() => {});
  }

  const prevGeneral = game.communityLinks?.playboundDiscord;
  const playboundDiscord = {
    ...playboundRecord(generalResult.channel, generalInvite, prevGeneral),
    provisionedAt: generalResult.created
      ? new Date()
      : prevGeneral?.provisionedAt || new Date(),
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
    created: generalResult.created || anyEditionCreated,
    editions: editionResults,
    layout: "franchise",
  };
}

/**
 * Idempotent provision for one published game (flat or franchise).
 */
async function provisionChannel(slug) {
  const game = await games.findOne({ slug, published: true });
  if (!game) throw new Error(`Unknown or unpublished game: ${slug}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();

  const publicEditions = await listPublicEditions(slug);
  if (publicEditions.length >= 2) {
    return provisionFranchise(guild, game, publicEditions);
  }
  return provisionFlatChannel(guild, game);
}

async function gameNeedsProvision(game) {
  const publicEds = await listPublicEditions(game.slug);
  if (publicEds.length >= 2) {
    const hasGeneral = Boolean(game.communityLinks?.playboundDiscord?.channelId);
    const edsMissing = publicEds.some((e) => !e.playboundDiscord?.channelId);
    // Also re-run if general exists but isn't named general / franchise may be incomplete
    return !hasGeneral || edsMissing;
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
    const list = await games
      .find({ published: true })
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

async function postGameOfTheWeek() {
  const gotw = await games.findOne({ published: true, gameOfWeek: true });
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
  const game = await games.findOne({ slug, published: true });
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

  res.writeHead(404);
  res.end("Not found");
});

await mongo.connect();
games = mongo.db().collection("cataloggames");
editions = mongo.db().collection("editions");
await client.login(TOKEN);
server.listen(PORT, () => console.log(`Webhook listening on :${PORT}`));
