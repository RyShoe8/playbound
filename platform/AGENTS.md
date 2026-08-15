<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# The database is the source of truth for game content

As of 2026-08-15 the production catalog in MongoDB is authoritative. Every
published game's content is correct as it stands there. The seed files in
`src/lib/data/` — `games.ts`, `editorial.ts`, `editions.ts` — are potentially
stale relative to it, because curation has happened through the admin CMS and
directly against the database.

**Never push seed over a game unless the user names that specific slug.**

`POST /api/admin/games/sync` takes an explicit `slugs` array and `$set`s a whole
payload for each one. Naming a slug replaces that game's title, tagline,
description, longDescription, media, systemRequirements, qualityBar, faq,
bestFor/notFor, communityLinks, `launcherInstall`, status and published flag
with whatever the seed says. There is no merge and no "keep the newer value" —
it is a deliberate overwrite, which is why bulk mode is refused.

The same applies to any script that writes catalog content from seed across the
whole catalog. `fix-game-media.ts`, `seed-editions.ts` (which also flips parent
games to published) and `seed-launcher-install.ts` all loop every entry and must
not be run against production. `seed-games.ts` is safe only because it counts
documents first and exits if any exist.

Editing `games.ts` or `editorial.ts` is fine and does nothing on its own —
nothing seeds on build or deploy. The danger is only ever at sync time.

## What this does not restrict

Automated maintenance is expected to keep writing:

- `/api/cron/catalog-versions` — the daily probe. It writes
  `launcherInstall.detectedVersion` and the three `versionCheck*` fields by
  dotted path, so curated content is untouched, and it auto-patches
  `url`/`fileName`/`versionLabel` for `direct*` recipes by design.
- `/api/games/[slug]/install/report` — install telemetry.
- The per-slug admin CMS routes under `/api/admin/games/[slug]` — that is a
  human editing one game on purpose.
