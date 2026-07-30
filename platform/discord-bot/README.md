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

On boot the bot backfills every **published** catalog game missing `communityLinks.playboundDiscord.channelId` (rate-limited). Publishing a game from admin also triggers a single-game provision.

Manual triggers:

- Per game: admin game editor → **Provision PlayBound Channel**
- All missing: admin Games list → **Provision missing channels**
- HTTP: `POST /provision-all` with `Authorization: Bearer $BOT_WEBHOOK_SECRET`

## Provision from admin

`POST /api/admin/games/[slug]/provision-discord` on the Next app forwards to this worker when `DISCORD_BOT_WEBHOOK_URL` + `BOT_WEBHOOK_SECRET` are set on Vercel.
