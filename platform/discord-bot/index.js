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
  PermissionFlagsBits,
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

if (!TOKEN || !GUILD_ID || !MONGODB_URI) {
  console.error("Missing DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, or MONGODB_URI");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const mongo = new MongoClient(MONGODB_URI);
let games;

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

async function ensureCategory(guild, name) {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === name
  );
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

async function provisionChannel(slug) {
  const game = await games.findOne({ slug, published: true });
  if (!game) throw new Error(`Unknown or unpublished game: ${slug}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.channels.fetch();

  const cat = await ensureCategory(guild, categoryNameForSlug(slug));
  const channelName = slug.slice(0, 90);

  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === channelName
  );
  if (!channel) {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: cat.id,
      topic: `${game.title} on PlayBound — ${SITE_URL}/games/${slug}`,
    });
  }

  const invite = await channel.createInvite({
    maxAge: 0,
    maxUses: 0,
    unique: false,
    reason: "PlayBound permanent game invite",
  });

  const msg = await channel.send(welcomeBody(game));
  await msg.pin().catch(() => {});

  const links = {
    ...(game.communityLinks || {}),
    playboundDiscord: {
      guildId: GUILD_ID,
      channelId: channel.id,
      channelName: channel.name,
      inviteCode: invite.code,
      inviteUrl: invite.url,
      provisionedAt: new Date(),
    },
  };

  await games.updateOne({ slug }, { $set: { communityLinks: links } });
  return links.playboundDiscord;
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
    // Missing Access (50001) usually means the bot was invited without the
    // applications.commands scope, or DISCORD_GUILD_ID is wrong / bot not in server.
    console.error(
      "Slash command registration failed (bot stays up for channel provisioning):",
      err?.rawError || err?.message || err
    );
    console.error(
      "Re-invite with both bot + applications.commands scopes, e.g.\n" +
        `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=268446720&scope=bot%20applications.commands&guild_id=${GUILD_ID}`
    );
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

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/provision") {
    const auth = req.headers.authorization || "";
    if (!WEBHOOK_SECRET || auth !== `Bearer ${WEBHOOK_SECRET}`) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }
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
      res.end(JSON.stringify({ success: true, playboundDiscord: result }));
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
