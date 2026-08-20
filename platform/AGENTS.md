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

The global scripts that did this have been deleted rather than documented as
dangerous: `seed-mods.ts`, `seed-editions.ts` (which also flipped parent games to
published), `seed-launcher-install.ts` and `fix-game-media.ts` all looped every
entry. Their replacements are scoped and insert-only —
`seed:missing-games`, `seed:missing-editions` and `seed:missing-mods`, each of
which refuses to run without explicit slugs. `seed-games.ts` remains, safe only
because it counts documents first and exits if any exist.

See `docs/database-seeding.md` for the full contract and when each is
appropriate.

Editing `games.ts` or `editorial.ts` is fine and does nothing on its own. One
thing does now run on deploy: `npm run build` ends with `seed:deploy`, which
creates seed mods that are absent for a named game list and never touches a row
that already exists. It is skipped unless `VERCEL_ENV` is `production`.

## What this does not restrict

Automated maintenance is expected to keep writing:

- `/api/cron/catalog-versions` — the daily probe. It writes
  `launcherInstall.detectedVersion` and the three `versionCheck*` fields by
  dotted path, so curated content is untouched, and it auto-patches
  `url`/`fileName`/`versionLabel` for `direct*` recipes by design.
- `/api/games/[slug]/install/report` — install telemetry.
- The per-slug admin CMS routes under `/api/admin/games/[slug]` — that is a
  human editing one game on purpose.
