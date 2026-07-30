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
let backfillRunning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function categoryNameForSlug(slug) {
  const ch = (slug[0] || "a").toLowerCase();
  return ch >= "n" ? "GAME CHANNELS — N–Z" : "GAME CHANNELS — A–M";
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

function missingChannelQuery() {
  return {
    published: true,
    $or: [
      { "communityLinks.playboundDiscord.channelId": { $exists: false } },
      { "communityLinks.playboundDiscord.channelId": null },
      { "communityLinks.playboundDiscord.channelId": "" },
    ],
  };
}

async function ensureCategory(guild, name) {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === name
  );
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

/**
 * Idempotent: reuses existing channel by stored channelId or by #slug name.
 * Only sends/pins welcome when the channel is newly created.
 */
async function provisionChannel(slug) {
  const game = await games.findOne({ slug, published: true });
  if (!game) throw new Error(`Unknown or unpublished game: ${slug}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();

  const existingId = game.communityLinks?.playboundDiscord?.channelId;
  let channel = existingId ? guild.channels.cache.get(existingId) : null;
  let created = false;

  if (!channel || channel.type !== ChannelType.GuildText) {
    const channelName = slug.slice(0, 90);
    channel = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === channelName
    );
  }

  if (!channel) {
    const cat = await ensureCategory(guild, categoryNameForSlug(slug));
    channel = await guild.channels.create({
      name: slug.slice(0, 90),
      type: ChannelType.GuildText,
      parent: cat.id,
      topic: `${game.title} on PlayBound — ${SITE_URL}/games/${slug}`,
    });
    created = true;
  } else {
    const topic = `${game.title} on PlayBound — ${SITE_URL}/games/${slug}`;
    if (channel.topic !== topic) {
      await channel.setTopic(topic).catch(() => {});
    }
  }

  const invite = await channel.createInvite({
    maxAge: 0,
    maxUses: 0,
    unique: false,
    reason: "PlayBound permanent game invite",
  });

  if (created) {
    const msg = await channel.send(welcomeBody(game));
    await msg.pin().catch(() => {});
  }

  const playboundDiscord = {
    guildId: GUILD_ID,
    channelId: channel.id,
    channelName: channel.name,
    inviteCode: invite.code,
    inviteUrl: invite.url,
    provisionedAt: game.communityLinks?.playboundDiscord?.provisionedAt || new Date(),
  };

  const links = {
    ...(game.communityLinks || {}),
    playboundDiscord: {
      ...playboundDiscord,
      provisionedAt: created ? new Date() : playboundDiscord.provisionedAt || new Date(),
    },
  };

  await games.updateOne({ slug }, { $set: { communityLinks: links } });
  return { playboundDiscord: links.playboundDiscord, created, skipped: !created };
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
    const cursor = games.find(missingChannelQuery()).project({ slug: 1, title: 1 });
    const list = await cursor.toArray();
    console.log(`Discord backfill: ${list.length} published game(s) missing a channel`);

    for (const doc of list) {
      try {
        const result = await provisionChannel(doc.slug);
        if (result.created) {
          provisioned.push(doc.slug);
          console.log(`Provisioned #${doc.slug}`);
        } else {
          skipped.push(doc.slug);
          console.log(`Linked existing #${doc.slug}`);
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

  // One-shot catalog backfill on boot — never crash the process.
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
await client.login(TOKEN);
server.listen(PORT, () => console.log(`Webhook listening on :${PORT}`));
