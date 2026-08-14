# PlayBound Discord bot

Long-lived worker for channel provisioning, welcome pins, slash commands, and Game of the Week posts.

## Deploy (Render)

1. Create a **Background Worker** (or Web Service) pointing at `platform/discord-bot`.
2. Set env: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `MONGODB_URI`, `SITE_URL`, `BOT_WEBHOOK_SECRET`, `PORT`.
3. Start command: `npm start`

Invite the bot with scopes `bot` **and** `applications.commands`, plus permissions:
Manage Channels, Manage Messages, Create Instant Invite, Send Messages, Embed Links.

Example invite URL (replace CLIENT_ID and GUILD_ID):

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=268446720&scope=bot%20applications.commands&guild_id=GUILD_ID
```

If slash-command registration logs `Missing Access`, the bot is missing `applications.commands` — re-invite with that URL. Channel provisioning still works once the bot is in the server with Manage Channels.

## Auto channel provisioning

On boot the bot backfills published catalog games that need PlayBound channels (rate-limited). Publishing a game from admin, or saving a public active edition under a published game, also triggers provision.

### Layout

**Single game** (fewer than 2 public active editions): one `#slug` text channel under `GAME CHANNELS — A–M` or `N–Z`.

**Multi-edition franchise** (2+ public active editions), e.g. EverQuest:

```
EverQuest                    (category)
  ├── #general               (game hub / invite stored on CatalogGame)
  ├── #official              (edition channel)
  ├── #project-quarm
  └── #project-99
```

Edition invites are stored on each Edition as `playboundDiscord` (separate from `links.discord`, which is the edition’s external community server).

Manual triggers:

- Per game: admin game editor → **Provision PlayBound Channel**
- All missing: admin Games list → **Provision missing channels**
- HTTP: `POST /provision-all` with `Authorization: Bearer $BOT_WEBHOOK_SECRET`
- HTTP: `POST /provision` body `{ "slug": "everquest" }`

## Provision from admin

`POST /api/admin/games/[slug]/provision-discord` on the Next app forwards to this worker when `DISCORD_BOT_WEBHOOK_URL` + `BOT_WEBHOOK_SECRET` are set on Vercel.

## New catalog game in #general

When a game is **created already published** or **first published** on production (`VERCEL_ENV=production`), the Next app POSTs `/announce-game` to this worker. The bot posts in the server’s `#general` (not franchise `#general` channels under game categories).

Optional env: `DISCORD_GENERAL_CHANNEL_ID` to pin the exact channel.

The post includes title, description, game page URL, and a screenshot (or cover) embed image.
