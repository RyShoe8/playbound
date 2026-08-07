# Catalog additions — handoff

Working notes for continuing the batch of games being added to the catalog.
Delete this file when the wave is finished.

## The job

Add the games listed below. **Games as `draft`, mods `published`.** As much
detail, media and mods as can be verified.

## Start here: switch HoloCure to Steam

HoloCure is currently in `scripts/add-games-wave-1.ts` with an `external`
launcher recipe pointing at itch.io, because itch generates download URLs per
session and there is no stable link to fetch.

**It is on Steam, and so is everything else on the list.** Steam is the better
route for all of them. For each game:

- set `steamAppId` on the game record
- use the `steam` install method on its edition
- keep `launcherInstall.kind` as `external` *unless* a genuinely fetchable
  direct download exists

One caveat worth keeping in mind: a Steam listing does not give the launcher
anything to download. Steam depots need the Steam client, so "installable via
Steam" means deep-linking to Steam, not one-click installing through PlayBound.
Anything marked one-click that actually needs Steam will fail on first use.

## The pattern to follow

`platform/scripts/add-games-wave-1.ts` is the template. It is already wired
into the build chain as `add:games-wave-1:apply` and runs on every deploy.

- **Insert-only.** An existing slug is skipped entirely. This is what makes it
  safe to leave in the build chain — an upsert would rewrite records from the
  constants in the file and silently revert anything edited in the admin.
- **Soft-fail on deploy**, so a database blip cannot block a release.
- Extend the `DEVELOPERS`, `GAMES` and `MODS` arrays. Each game needs a
  developer record; create one if it does not exist.

Dry run:

```bash
npm run add:games-wave-1
```

Apply locally (needs a real `MONGODB_URI` — the one in `.env.local` is masked
as `[SENSITIVE]`, which is why every local database read fails):

```bash
npm run add:games-wave-1 -- --apply
```

Start a `wave-2` script rather than growing this one indefinitely.

## Enum traps — these have already broken records three times

Validation runs on every save regardless of draft status, and a stored value
outside a closed set previously made a record **permanently unsaveable from the
admin**: the form only renders options it recognises, so an unrecognised one
cannot be seen or unticked, yet it is still submitted and still fails.

`gamePayload.ts` now filters unknown genres and launch methods rather than
rejecting, so bad values heal on the next save — but do not rely on that.

- **`launchMethods`** — only `browser`, `install`, `server`. Not `desktop`.
- **`genres`** — closed set, now 26 values after the recent extension. Defined
  in **three** places that must agree:
  - `GENRES` in `src/lib/gamePayload.ts` (validates)
  - the `Genre` union in `src/lib/data/types.ts` (types)
  - the alias map in `src/lib/adminImportHelpers.ts` (imports)
- **`tags`** — Title Case with spaces (`Base Building`, `Arena Shooter`), never
  slug style. Hyphens only inside compound words (`Turn-Based`).
- **`art.icon`** — must be one of the Lucide icons imported by
  `src/components/GameArt.tsx`.
- **Required fields** — `art`, `systemRequirements`, `license`, `releaseYear`,
  `sizeMB`, `website`, `tagline`, `description`, `developerSlug`.

## Accuracy bar

Take every field from the game's own store page or site. **Do not guess release
years, sizes or system requirements** — a wrong size on a public catalog is
worse than a missing entry. If a field cannot be verified, leave it out.

Do not invent mods. Most live-service titles here prohibit them; zero mods is
the correct answer for most of this list.

## Games still to add

Sky: Children of the Light · Albion Online · Enlisted · Tom Clancy's Rainbow Six
Siege · Where Winds Meet · Once Human · The Finals · Path of Exile · Palia ·
Guild Wars 2 · Fishing Planet · Star Trek Online · World of Sea Battle · Poppy
Playtime · EVE Online · Trackmania · DC Universe Online · Lord of the Rings
Online · Star Wars: Knights of the Old Republic · Goose Goose Duck · Asphalt
Legends · Old School RuneScape · Idle Slayer · Strikers Club · The Spike ·
HoloCure *(added, needs Steam switch)* · Poco · Ye Guild Clerk

## Unrelated loose ends

- **Launcher rebuild pending.** The servers page no longer auto-fetches until a
  game is picked, on both the website and the launcher. The launcher half only
  reaches users on a rebuild — last upload to the blob was `0.1.39`. Bump,
  `npm run dist`, then `npm run upload:launcher` from `platform/`.
- **`seed:games` and `seed:weekly` skip entirely** once the catalog holds
  anything, so entries added to those static seed files never reach the
  database. That is why bespoke scripts exist. Converting them to per-slug
  inserts (as `seed:developers` and `seed:collections` already work) would fix
  this properly.
- **Local builds are flaky**, failing intermittently in `/icon` and
  `/apple-icon` generation with a libvips colourspace error. Pre-existing and
  environment-specific; Vercel builds are unaffected.
