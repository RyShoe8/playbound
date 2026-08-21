# Database seed scripts

The catalog in MongoDB is the source of truth. The files in `src/lib/data/` —
`games.ts`, `editions.ts`, `mods.ts` and friends — are **seed**, and they are
potentially stale against it, because curation happens through the admin CMS and
directly against the database.

That single fact decides how every script here behaves. Seed can *add* what the
database does not have. It must not *correct* what the database already has,
because seed is the older opinion.

Editing a seed file is always safe. Nothing reads it at runtime and nothing
seeds on its own. The risk is only ever at write time.

---

## The safe scripts

All three follow the same contract:

- **Scoped.** They require explicit slugs and refuse to run without them.
- **Insert-only.** An existing row is left exactly as it is — no `$set`, no
  merge, no "fill in the gaps".
- **Never delete.**
- **Idempotent.** The second run and every run after it is a no-op.
- **Draft.** New rows are created unpublished, so a person decides when they go
  live.
- **Never fail a build.** They exit 0 on error. A missing mod is recoverable; a
  deploy that will not ship is not.

```bash
npm run seed:missing-games     -- --slugs opentyrian
npm run seed:missing-editions  -- --games holocure
npm run seed:missing-mods      -- --games wolfenstein-enemy-territory
```

Add `--dry-run` to any of them to print what would be created without writing.
Do that first. It costs nothing and it is the only way to see the blast radius
before it happens.

### On deploy: nothing

**A build writes nothing to the database.** `npm run build` is `next build`
followed by `check:auth-urls`, which only reads.

It used to end with `seed:deploy`. That was appropriate while the catalog was
still being filled in and a deploy creating an absent row was useful. The
catalog is curated now, so the right number of rows for a build to create is
zero — and a build that *can* write is a build that can surprise you on a day
you were only shipping a CSS change.

`seed:deploy` is still defined and still works. It is a manual tool:

```
npm run seed:missing-mods -- --games <slug> --dry-run   # look first
npm run seed:deploy                                     # then write
```

**Do not put it back in `build`.** If you ever need seeding on deploy again,
argue for it explicitly rather than restoring it by reflex.

The `VERCEL_ENV === "production"` guard inside each script stays regardless. It
is now a second line of defence rather than the only one, and it is worth
keeping because preview deploys carry production's environment variables — a
branch build would otherwise write to the live catalog.

And if you ever do reintroduce a deploy-time step, do not try to guard it in
package.json. The obvious shape —

```
node -e "if (notProduction) process.exit(0)" && npm run seed
```

— runs the seed on success, which is backwards, and the mistake is invisible
until a preview build writes to production. That is why the guard lives inside
the scripts.

---

## What was removed, and why

These existed and were deleted rather than fixed. Each looped the entire catalog,
which no amount of care at the call site makes safe.

| Script | What it did |
|---|---|
| `seed:mods` | `deleteMany` twice, then upserted every mod in the catalog |
| `seed:editions` | Looped every edition **and flipped parent games to published** |
| `seed:launcher-install` | Rewrote every game's install recipe from seed |
| `fix:game-media` | Rewrote media across every game |

`seed-editions.ts` is the clearest example of why a global script is the wrong
shape: adding an edition should never publish a game, but as one loop over
everything it did both, and the second effect is invisible from the name.

---

## Still present, and when they are appropriate

| Script | Safe because |
|---|---|
| `seed:games` | Counts documents first and exits if any exist. First-run only. |
| `seed:admin`, `seed:developers`, `seed:hardware`, `seed:collections`, `seed:weekly`, `seed:store-providers`, `seed:mod-classifications` | Reference data, not curated catalog content. |
| `insert:catalog-wave` | Takes an explicit list. |
| `patch:named-mods` | Named mods only. |
| `fix:mod-media` | Backfill-only — fills empty fields, never overwrites. |
| `migrate:*` | One-off schema migrations. Most take `--apply`; without it they report and change nothing. |

---

## Writing a new one

Before adding a script that writes catalog content, check whether an admin route
already does it for one record. `POST /api/admin/editions/materialize` and the
per-slug routes under `/api/admin/games/[slug]` exist precisely so a human can
change one thing on purpose.

If a script is genuinely needed, copy `seed-missing-mods.ts`. It is the shortest
correct example of the contract above.

Two specific traps, both of which have already happened here:

**`findOneAndUpdate` with `upsert: true` is not an insert.** It rewrites a row
that appeared between your read and your write. Use `create` and treat a
duplicate-key error as the success case — it means someone else got there first,
which is exactly when you should decline.

**"Only fills empty fields" is still a write to every row.** It touches
`updatedAt` on the whole collection, and it encodes an assumption that an empty
field means nobody has decided yet, when it may mean somebody cleared it.

---

## Related

- `AGENTS.md` — the source-of-truth rule and what automated maintenance is
  still expected to write (`/api/cron/catalog-versions`, install telemetry, the
  per-slug admin routes).
