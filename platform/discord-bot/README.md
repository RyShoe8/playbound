# PlayBound Discord bot

Long-lived worker for channel provisioning, welcome pins, slash commands, and Game of the Week posts.

## Deploy (Render)

1. Create a **Background Worker** (or Web Service) pointing at `platform/discord-bot`.
2. Set env: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `MONGODB_URI`, `SITE_URL`, `BOT_WEBHOOK_SECRET`, `PORT`.
3. Start command: `npm start`

Invite the bot with scopes `bot` + `applications.commands` and permissions: Manage Channels, Manage Messages, Create Instant Invite, Send Messages, Embed Links.

## Provision from admin

`POST /api/admin/games/[slug]/provision-discord` on the Next app forwards to this worker when `DISCORD_BOT_WEBHOOK_URL` + `BOT_WEBHOOK_SECRET` are set on Vercel.
