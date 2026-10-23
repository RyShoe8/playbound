# PlayBound Discord bot

Long-lived worker for channel provisioning, welcome pins, slash commands, and Game of the Week posts.

## Deploy (Render)

1. Create a **Background Worker** (or Web Service) pointing at `platform/discord-bot`.
2. Set env: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `MONGODB_URI`, `SITE_URL`, `BOT_WEBHOOK_SECRET`, `PORT`.
3. Start command: `npm start`

## VPS cutover for reliable party voice

Render's shared outbound IP has received long Discord gateway rate limits. The
VPS can run the same bot as a persistent container behind its existing Traefik
proxy; keep just **one** bot instance logged in to Discord at a time.

1. Create an A record for `bot.playbound.club` pointing to the VPS public IP.
2. On Windows, connect with
   `ssh -i "$env:USERPROFILE\.ssh\playbound_vps" root@147.93.133.235`, then run
   `nano /etc/playbound-discord-bot.env`. Copy `DISCORD_BOT_TOKEN`,
   `DISCORD_GUILD_ID`, `MONGODB_URI`, and `BOT_WEBHOOK_SECRET` from the Render
   Discord bot service's Environment page; add `SITE_URL=https://playbound.club`.
   Put one `NAME=value` entry per line. Save with Ctrl+O, Enter, Ctrl+X and
   keep this file root-only (`chmod 600 /etc/playbound-discord-bot.env`). Do
   not put secret values in shell commands, version control, tickets, or chat.
3. Suspend the Render bot before starting this copy, so one token does not
   create competing Discord gateway sessions. Copy this directory to
   `/opt/playbound-discord-bot` and run
   `docker compose -f compose.vps.yml up -d --build` there. The compose file
   uses the VPS's existing external `netbird_netbird` Docker network and Traefik.
4. Verify `https://bot.playbound.club/health/discord` reports ready and that
   an authenticated party voice provisioning request works. Then change
   Vercel's `DISCORD_BOT_WEBHOOK_URL` to `https://bot.playbound.club`, keeping
   the same `BOT_WEBHOOK_SECRET`.
5. Keep the Render bot suspended. Run
   `docker compose -f compose.vps.yml exec discord-bot node smoke-voice.js`
   to create and then remove a temporary voice room. Test **Launch Voice** from
   a real party as the final player-facing check.

The site and launcher offer the general PlayBound Discord invite if a party
voice room cannot be created. That fallback is explicitly labelled as a
fallback; it is not a substitute for the dedicated party room.

Invite the bot with scopes `bot` **and** `applications.commands`, plus permissions:
Manage Channels, Manage Messages, Manage Webhooks, Create Instant Invite, Send Messages, Embed Links, Move Members.

In the Discord Developer Portal, enable **Message Content Intent** (privileged). Party and event chat in PlayBound reads channel messages.

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

## Dedicated server support

`POST /hosting-support` (with the same bearer secret) idempotently creates
`#dedicated-server-support` and returns a permanent invite for that channel.
The hosting page and My Servers support panel link through
`/api/hosting/support/discord` to send visitors into the room. This requires
the existing `DISCORD_BOT_WEBHOOK_URL` and `BOT_WEBHOOK_SECRET` on Vercel and
the bot's Manage Channels/Create Instant Invite permissions.

## New catalog game in #general

When a game is **created already published** or **first published** on production (`VERCEL_ENV=production`), the Next app POSTs `/announce-game` to this worker. The bot posts **one embed** in the server’s `#general` (not franchise `#general` channels under game categories): hero image, `thatOneThing`, and the title linked to the game page — no extra content links.

New publications are queued in the game document before delivery. The site retries pending announcements every 15 minutes; the bot records delivery against that exact publication so a timed-out HTTP response cannot produce a second post. The hourly channel sweep repairs missing channels. For an older publication that missed both actions before this queue existed, use **Repair channel and announcement** in that game's admin editor. Already delivered queued publications are not reposted.

Optional env: `DISCORD_GENERAL_CHANNEL_ID` to pin the exact channel.

The post includes title, description, game page URL, and a screenshot (or cover) embed image.

## Event Planner & Pop-Up Game Nights

- **Event Rooms category**: Temporary voice and text rooms created for Game Nights and tournaments live under the `Event Rooms` category.
- **#events channel**: When event rooms are provisioned or scheduled announcements are sent (`POST /events/announce`), the bot posts event cards directly into the server's `#events` channel.
- Optional env: `DISCORD_EVENTS_CHANNEL_ID` to pin the exact events channel.
