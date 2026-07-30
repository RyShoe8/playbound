# SEO Implementation — What Shipped

Companion to [SEO-STRATEGY.md](./SEO-STRATEGY.md). Everything in weeks 1–12 of that plan that could be done in code is done. `tsc --noEmit` and `eslint` both pass clean.

---

## Blocking: three things only you can do

**1. Kill the duplicate domain.** This is the single most damaging issue found and it cannot be fixed in code.

In Vercel → project → Settings → Domains:

- Set `playbound.club` as the **Production** domain.
- Change `playbound-five.vercel.app` to **Redirect** → `playbound.club`.

Right now that host serves a byte-identical crawlable copy of the entire site, and until it redirects, Google has two full copies of every page to choose between.

**2. Set the environment variable.** In Vercel → Settings → Environment Variables, **Production only**:

```
NEXT_PUBLIC_SITE_URL = https://playbound.club
```

Leave it unset on Preview and Development — those builds intentionally serve `Disallow: /` and a `noindex` meta tag, so previews can never be indexed.

**3. Delete one empty directory.** `platform/src/app/games/[slug].md/` is an empty folder left over from restructuring. The sandbox running this work couldn't remove directories. It's empty so Next.js ignores it, but delete it before committing:

```powershell
Remove-Item -Recurse -Force "platform\src\app\games\[slug].md"
Remove-Item -Force "platform\scripts\verify-maintenance.mjs"
```

Then verify and deploy:

```bash
cd platform
npm run typecheck
npm run verify:maintenance
npm run build
```

Note: `next build` could not be run here — `node_modules` holds Windows native binaries and the Linux sandbox had no registry access to fetch its own. Run it locally before deploying. Typecheck and lint both pass, and every component contract was verified against its source signature, so nothing structural is expected to fail.

---

## After deploying

- **Google Search Console** — verify `playbound.club`, submit `https://playbound.club/sitemap.xml`, request indexing on the homepage and `/standards`.
- **Bing Webmaster Tools** — same. Bing matters disproportionately here because it grounds ChatGPT search.
- **Confirm the fixes landed**: `/robots.txt` returns rules (not 404), `/sitemap.xml` lists ~120 URLs, `/llms.txt` returns the catalog, and `view-source:` on a game page shows `<link rel="canonical">` pointing at `playbound.club`.

---

## Technical foundation

| File | What it does |
|---|---|
| `src/lib/site.ts` | **New.** Canonical origin, site copy, and the five PlayBound Bar criteria as the single source of truth. |
| `src/app/robots.ts` | **New.** Was a 404. Allows 14 named AI crawlers explicitly, disallows admin/auth/personal routes and `?tab=`, serves `Disallow: /` on non-production. |
| `src/app/sitemap.ts` | **New.** Generated from the live catalog, so new games appear automatically. Excludes `/play` interstitials. |
| `src/app/layout.tsx` | `metadataBase` hardcoded to the canonical origin. Previously derived from `NEXTAUTH_URL`, which leaked the preview host into every `og:url`. |
| `src/lib/seo.ts` | **New.** `pageMetadata()` helper — canonical + OG + Twitter in one call, with description clamping. |
| `src/components/JsonLd.tsx` | **New.** Was zero structured data site-wide. |

**Canonicals now exist on every page.** One line on the game page collapses all nine `?tab=` variants into a single indexable URL — that alone removes ~160 near-duplicate URLs from the crawl.

**`noindex` added** to `/admin/*`, `/library`, `/profile`, `/login`, `/signup`, `/verify-email`, `/launcher/auth`, and `/search`. Login, signup and verify-email are client components and can't export metadata, so each got a thin `layout.tsx`.

---

## Structured data

Emitted server-side in the initial HTML (not via `next/script`) because most AI crawlers don't execute JavaScript:

- **`Organization`** + **`WebSite`** with `SearchAction` — site-wide, in the root layout. This is the entity record everything else references by `@id`.
- **`VideoGame`** on every game page — with `offers` at price 0, explicit `license`, and `sameAs` to official site, GitHub and Steam. The zero-price offer plus licence is what lets a machine assert "this is genuinely free."
- **`Review`** carrying the PlayBound Bar verdict, authored by the Organization, with a rating of *n* of 5 criteria met. This is what makes the editorial judgement machine-readable **and attributable to the brand**.
- **`AggregateRating`** — only when real reviews exist. Never synthesised.
- **`FAQPage`** on game, install, servers, collection, compare, alternatives and standards pages.
- **`HowTo`** on install pages, with a zero-cost `estimatedCost`.
- **`ItemList`** on collections, alternatives and compare indexes — what makes a "Best Free X" page legible as a ranked recommendation.
- **`BreadcrumbList`** on every nested page.

---

## New pages

| Route | Why |
|---|---|
| `/standards` | **The PlayBound Bar.** The named, published, five-criterion framework. Highest-value citation asset in the plan — a model citing a *criterion* must name the source. |
| `/weekly` | Archive index. Tabular, dated, skimmable — the format most likely to be quoted as "PlayBound's picks." |
| `/weekly/[year]-w[nn]-[slug]` | Permanent dated issue pages. Never change these slugs; they accumulate links. |
| `/alternatives` + 12 pages | The sharpest wedge in the strategy. Command & Conquer, Age of Empires, Supreme Commander, Cities: Skylines, Minecraft, Factorio, Worms, Mario Kart, Quake, Diablo, Elite Dangerous, Super Mario Bros. High intent, no incumbent — current results are Reddit threads. |
| `/compare` + 6 pages | Research showed AI assistants answer "X vs Y" by stitching forum posts together because no page presents a comparison. Least-defended surface in the niche. |
| `/games/[slug]/install` | Promoted out of query params. Falls back to instructions derived from real catalog facts, so it's never empty and never invents steps. |
| `/games/[slug]/servers` | Promoted out of `?tab=servers`. Query params cannot rank. |
| `/mods` | **Was missing entirely.** ~42 mod pages were reachable only via 8 homepage cards. Now grouped by game. |
| `/collections` | **Was a redirect to `/discover#collections`.** Now a real index. |
| `/developers` | **Was a redirect to `/discover`.** Now a real index, filtered to teams with catalog entries. |

Homepage `H1` changed from the rotating hero game title to a descriptive heading; the hero title is now an `H2`. `/collections`, `/weekly`, `/mods` and `/standards` added to the sidebar; the footer went from 6 links to 13.

---

## AI-facing surfaces

- **`/llms.txt`** — generated from the live catalog: the five criteria, every game with its verdict and verification date, the Weekly archive, collections, alternatives, comparisons, plus a citation note asking for the verification date to be included.
- **`/games/{slug}.md`** — chrome-free markdown mirror of every game page. Rewritten in `next.config.ts` to `/games/[slug]/markdown`, since Next route segments must be wholly dynamic.
- **`/api/public/catalog`** — the catalog as normalised JSON, CORS-open, CC BY 4.0 with attribution required.
- **`/api/public/servers`** — live player counts across every multiplayer title. This is genuinely unique data nobody else publishes, and it's the kind of verifiable dated dataset that earns citations and links. `robots.ts` explicitly allows `/api/public/` despite the blanket `/api/` disallow.

---

## Content

`Game` gained `qualityBar`, `longDescription`, `whyWePickedIt`, `installSteps`, `faq`, `bestFor`, `notFor`, `comparableTo`, `updatedAt` — all optional, so existing DB documents stay valid. `CatalogGame` schema and the catalog mapper carry them through, with fallback to the seed entry so a factual re-import can't wipe hand-written content.

**All 18 games were written up** in `src/lib/data/editorial.ts`, deliberately kept separate from `games.ts`: facts change when upstream changes, judgement doesn't. Each game got a quality-bar assessment with a quotable verdict, 400–600 words of original editorial, a curation rationale, 5–7 FAQ entries, and honest `bestFor` / `notFor` lists.

Two entries worth flagging, because honesty is the point of the exercise:

- **Veloren scores 4 of 5.** It fails "finished" — it's openly pre-1.0 with systems that change between releases. Listed anyway, with the caveat stated plainly on the page.
- **0 A.D. is marked finished despite its alpha label**, with the reasoning written out: the label reflects the project's own standards, not the play experience.

`notFor` is the field that matters most for citability. Nobody else in this niche publishes limitations, and stated weaknesses are what separate a source worth quoting from a directory.

---

## Adding games and mods

Importing from a Steam link, GitHub link or any URL now fills the deeper fields too — but only the half that can be filled honestly. `src/lib/enrich.ts` draws the line explicitly:

**Derived automatically** — facts restated, safe to generate because they assert nothing not already true in the catalog:

- **Install steps**, per platform, built from the launcher recipe, GitHub releases, Steam app id and platform list. The same function is the runtime fallback on `/games/[slug]/install`, so a generated guide and a hand-edited one can never disagree about the facts.
- **FAQ**, matching the real long-tail queries — is it free, how big, what platforms, do I need an account, is it still active.
- **Quality-bar signals.** A recognised OSI licence establishes *genuinely free* and *won't disappear*. *Actively maintained* is established by a live GitHub call for pushes and releases against the twelve-month threshold.

**Never generated** — the verdict, why we picked it, best-for, not-for, and the long description. Generating those would make the curation claim false, which is the one thing the whole positioning rests on.

Two supporting behaviours worth knowing:

The importer returns **evidence** rather than just results — "Genuinely free: open-source licence GPL-3.0. Confirm there is no separate paid content" — so you can see what was established and on what basis. Where it can't establish something it says so rather than guessing. Steam's `is_free` flag in particular is treated as one signal, not proof, because it says nothing about pay-to-win.

For GitHub imports it also fetches the **README as source material**, shown in a read-only panel. Deliberately not pasted into the long description: that would be duplicate content, wouldn't rank, and would hollow out the editorial claim. It's there to read, not to copy.

Suggested `bestFor` / `notFor` entries are offered as clickable chips derived from facts — "a 180 MB download runs on old laptops", "no native macOS build". Suggestions rather than auto-fill, because deciding a fact is worth saying is still an editorial call.

### The publish gate

**This is a behaviour change worth flagging.** A game or mod can no longer be published until the human-written fields exist. Drafts save freely; only `published: true` is gated. Both admin forms show a live checklist, disable the Published toggle with the count of what's missing, and the same check runs server-side (422 with the field list) so the API can't be bypassed.

The reasoning: PlayBound's entire value proposition is that inclusion means a person assessed the game. One published listing with no assessment quietly falsifies that for every other entry too. A quality bar that can be skipped under deadline pressure is marketing copy.

If it turns out to be too strict in practice, the thresholds are constants at the top of `editorialReadiness()` and `modEditorialReadiness()` in `src/lib/enrich.ts` — say the word and I'll soften it to a warning instead.

### Mods

Mods got a matching `/api/admin/mods/import` route (GitHub repo or project page, with the base game chosen first so install steps name it correctly), the same derived install steps and FAQ, and new `longDescription`, `whatItChanges` and `compatibility` fields. Mod pages now render all of it plus `SoftwareApplication`, `HowTo` and `FAQPage` schema, and finally have real per-page metadata instead of inheriting the site description.

Both seed scripts apply the same derivation, so a seeded entry and an imported one end up identically shaped in the database.

---

## Keeping the bar honest

"Actively maintained as of July 2026" is the one criterion with a shelf life — and that's exactly why it's citable, because it must be re-fetched rather than recalled from training data. So it has to actually be true.

```bash
npm run verify:maintenance
```

`scripts/verify-maintenance.ts` imports the real catalog data (rather than regex-scraping source), checks each game's upstream GitHub repository for pushes and releases, and **exits non-zero** if any game claiming active maintenance has no activity in 12 months, is archived upstream, or has an assessment older than 180 days.

Five projects don't develop on the GitHub repo in the catalog — Xonotic and 0 A.D. run their own infrastructure, Hedgewars uses Mercurial, and BAR and Zero-K ship through their own launchers. Rather than guess repository paths, `maintenanceChecks` in `editorial.ts` records the URL a human checked and when. The script fails on any stale manual check, so **an unverified claim fails loudly rather than passing silently**.

Consider wiring this into CI. A quality bar nobody checks is marketing copy.

---

## Not done — needs a human

These are from the strategy but aren't code:

- Upstream contribution for links (docs, patches, wikis) — the primary realistic link route at DR 0.
- Wikipedia and Wikidata contribution. Build a real edit history; don't spam links.
- Directory submissions: alternativeto.net, Product Hunt, Slant, SaaSHub.
- Weekly distribution rhythm: r/opensourcegames, r/linux_gaming, Hacker News, project forums.
- The first monthly LLM citation audit against a fixed 25-query set.
- `SITE_SAME_AS` in `src/lib/site.ts` is an empty array — populate it with social profile URLs as accounts go live. Entity resolution depends on corroborating references.
- `/not-here` (notable free games that failed the bar, and why) is specced in the strategy but not built. It's the strongest possible proof the standard is real, and it captures "is X actually free" queries.

---

## Writing next week's issue

The whole flywheel is one file. Add an entry to `weeklyIssues` in `src/lib/data/weekly.ts`:

```ts
{
  year: 2026,
  week: 32,
  gameSlug: "mindustry",
  publishedAt: "2026-08-07",
  headline: "...",
  verdict: "...",   // self-contained, quotable verbatim
  body: "...",      // 150–300 words, \n\n between paragraphs
}
```

The archive page, the issue page, the sitemap entry, `llms.txt`, the game-page cross-link and the `Article` schema all follow automatically. Then add the game's editorial block if it's new, and consider a matching `/compare` or `/alternatives` page — that's the eight-assets-per-week cluster from §5 of the strategy.

Write `verdict` as a sentence that stands alone with no context. That's the line that gets quoted.
