# PlayBound — SEO & LLM Citation Strategy

**Audited:** 29 July 2026 · playbound.club · Next.js App Router on Vercel
**Baseline:** Ahrefs Domain Rating **0** · no backlink profile · not yet indexable (no robots.txt, no sitemap)
**Catalog:** 18 games, 8 collections, ~42 mods, 19 developers — all open-source titles
**Core hook:** PlayBound Weekly — one high-quality free game every Friday

---

## 1. The bet, in one paragraph

**The product is the quality bar, not the catalog.** Free games are not scarce — there are tens of thousands, and almost all of them are bad. What is scarce is a trustworthy answer to "of the free games, which ones are actually *good*?" Every incumbent in this space is a directory: SourceForge lists everything, slant.co votes on everything, fossgames.com indexes everything. Comprehensiveness is their pitch. It is also their weakness, because a list of 98 games answers nothing. PlayBound's pitch is the inverse — a small, deliberately gated catalog where inclusion is itself the recommendation, and one editor's pick a week. That is a fundamentally more citable position than any directory can occupy, because a directory has no opinion to quote.

PlayBound cannot win "free games" — that term belongs to GamesRadar, GameSpot and PCGamesN (DR 85+, 15-year link profiles) and it resolves to live-service free-to-play, which is not what PlayBound stocks. The winnable ground is the **decision layer**: "which of these should I actually play, and how do I get it running." Research confirms nobody owns it — LLMs currently answer those questions by stitching together GitHub wikis, project FAQs and forum threads. Win that layer in the free/open-source niche first, compound editorial authority through the Weekly at one durable asset per week, then expand outward from real domain strength.

**Sequencing:** niche now → broad later. Do not chase "best free PC games" in year one. Earn it.

### 1.1 The quality bar is a publishable asset

Curation only functions as a moat if the standard is explicit. An unstated "we picked good ones" is indistinguishable from a directory. A published, named, consistently-applied standard is a citable framework — and frameworks get quoted *by name*, which drags the brand along with them.

Ship this as a real page at `/standards`, and reference it from every game page:

> **The PlayBound Bar.** A game earns a place here only if it clears all five:
> 1. **Genuinely free** — no trial, no paywalled campaign, no pay-to-win, no cosmetic treadmill.
> 2. **Finished enough to enjoy** — playable start to finish today, not a promising alpha.
> 3. **Actively maintained** — a release or meaningful commit within the last 12 months.
> 4. **Stands on its own merits** — good enough to recommend even if it cost money.
> 5. **Won't disappear** — open-source or self-hostable, so no shutdown can take it away.

Each criterion is independently verifiable, which is what makes it quotable rather than marketing copy. Criterion 5 in particular is a claim no commercial free-to-play list can make.

Two structural consequences follow. **Publish the rejections.** A `/not-here` page explaining which well-known free games failed the bar and why is the strongest possible proof the standard is real — and it captures a large set of "is X actually free" queries. **Never pad the catalog.** Every marginal title added to hit a number weakens the only asset that matters. 18 defensible games beats 200 indexed ones.

---

## 2. Where PlayBound stands today

| Signal | State | Consequence |
|---|---|---|
| `robots.txt` | **404** | No crawl directives; no sitemap discovery path |
| `sitemap.xml` | **Missing** | ~250 URLs rely on link discovery alone |
| `llms.txt` | **Missing** | No machine-readable catalog summary for AI crawlers |
| Structured data | **Zero `ld+json` in codebase** | Invisible to rich results and to entity extraction |
| Canonical tags | **None** | Query-param and cross-domain duplication uncontrolled |
| Meta descriptions | **1 for the whole site** | All 18 game pages inherit the homepage description |
| `metadataBase` | Resolves to `NEXTAUTH_URL` | `og:url` on playbound.club emits `playbound-five.vercel.app` |
| Staging domain | **Fully crawlable duplicate** | `playbound-five.vercel.app` serves the identical site |
| Unique prose per game | **~44 words** | Far too thin to rank or be cited |
| `/collections`, `/developers` | Exist but **orphaned** | Not in sidebar or footer; homepage links to `/discover#collections` |
| Mods index | **Does not exist** | ~42 mod pages reachable only via 8 homepage cards |
| Tab navigation | `?tab=` × 9 per game | ~162 near-duplicate crawlable URLs, no canonicals |
| Private routes | No `noindex` | `/admin`, `/library`, `/profile`, `/login`, `/signup` all indexable |

Rendering is server-side throughout, H1s are correct on game pages, and internal linking between games, collections and developers is already decent. The foundation is sound. The problem is that almost nothing tells a crawler — or an LLM — what any of it means.

> **Data caveat:** the connected Ahrefs API key returns `Insufficient plan` for Keywords Explorer, Site Explorer and SERP endpoints. Every keyword in this document is prioritised by SERP inspection and competitive reasoning, **not** by verified volume. Section 10 lists the exact terms to validate once a paid seat is available. No volume figures are asserted here, because none could be confirmed.

---

## 3. Technical fix list

### P0 — Blocking. Do this week.

**3.1 Kill the duplicate domain.** `playbound-five.vercel.app` currently serves a byte-identical crawlable copy of the site. Worse, the canonical domain's own `og:url` points *at* the staging domain, actively telling social and AI crawlers that the wrong host is authoritative.

- In Vercel project settings, set `playbound.club` as the Production domain and mark the `.vercel.app` alias as a redirect to it.
- Hardcode the canonical base rather than deriving it from auth config:

```ts
// src/app/layout.tsx — replace getSiteUrl()
const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://playbound.club"
);
```

- Add `NEXT_PUBLIC_SITE_URL=https://playbound.club` to Production env only. Preview deployments keep their own value and get `noindex` (below).

**3.2 Ship `robots.txt`.** Create `src/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://playbound.club";
const isProd = process.env.VERCEL_ENV === "production";

export default function robots(): MetadataRoute.Robots {
  if (!isProd) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin", "/api/", "/library", "/profile",
          "/login", "/signup", "/verify-email", "/launcher/auth",
          "/*?tab=", "/*?callbackUrl=",
        ],
      },
      // Explicitly welcome AI crawlers — several are conservative by default.
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "Claude-SearchBot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
      { userAgent: "CCBot", allow: "/" },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
```

Allowing `Google-Extended` and `Applebot-Extended` is a deliberate trade: it opts PlayBound's content into AI training and grounding corpora. For a site whose growth thesis is *being the cited authority*, that is the correct call.

**3.3 Ship a dynamic sitemap.** Create `src/app/sitemap.ts`, sourced from the live catalog so it stays correct as games are added weekly:

```ts
import type { MetadataRoute } from "next";
import { listGames, collections, developers } from "@/lib/catalog";
import { listMods } from "@/lib/mods";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://playbound.club";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const games = await listGames();
  const mods = await listMods();

  return [
    { url: base, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/discover`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/collections`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/servers`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${base}/weekly`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/developers`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/launcher`, changeFrequency: "monthly", priority: 0.7 },
    ...games.map((g) => ({
      url: `${base}/games/${g.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...collections.map((c) => ({
      url: `${base}/collections/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...mods.map((m) => ({
      url: `${base}/mods/${m.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...developers.map((d) => ({
      url: `${base}/developers/${d.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
```

Exclude `/games/[slug]/play` — it is a redirect interstitial with no standalone value and it competes with the game page.

**3.4 Per-page metadata.** Every page currently inherits one description. Replace the game-page `generateMetadata` with a full implementation, and repeat the pattern for collections, mods and developers:

```ts
// src/app/games/[slug]/page.tsx
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: "Game Not Found" };

  const desc =
    `${game.title} is a free, open-source ${game.genres.join("/")} game ` +
    `for ${game.platforms.join(", ")} — ${game.sizeMB} MB, ${game.license}. ` +
    `${game.tagline} Install it free through PlayBound.`;

  return {
    title: `${game.title} — Free ${game.genres[0]} Game`,
    description: desc.slice(0, 158),
    alternates: { canonical: `/games/${game.slug}` },
    openGraph: {
      type: "article",
      url: `/games/${game.slug}`,
      title: `${game.title} — Free & Open Source`,
      description: game.tagline,
      images: game.coverImage ? [{ url: game.coverImage }] : undefined,
    },
  };
}
```

The `alternates.canonical` entry solves the `?tab=` duplication in one line: all nine tab variants collapse to the clean game URL.

**3.5 `noindex` private routes.** Add to `/admin/layout.tsx`, `/library`, `/profile`, `/login`, `/signup`, `/verify-email`, `/launcher/auth`:

```ts
export const metadata: Metadata = {
  title: "Library",
  robots: { index: false, follow: false },
};
```

### P1 — High leverage. Weeks 2–4.

**3.6 Structured data.** This is the single highest-value item for both search and AI citation, and there is currently none. Add a small `<JsonLd>` component and emit:

- **`VideoGame`** on every game page — `name`, `description`, `genre`, `gamePlatform`, `operatingSystem`, `applicationCategory: "Game"`, `fileSize`, `datePublished`, `author` (→ developer entity), `license`, `sameAs` (official site, GitHub repo, Wikipedia, Steam), and `offers` with `price: "0"`, `priceCurrency: "USD"`. The `offers`-at-zero and `license` fields are what let a machine assert "this is genuinely free," which is the exact claim PlayBound wants attached to its name.
- **`AggregateRating`** on games with reviews — only where real review data exists. Never synthesise it.
- **`ItemList`** on collection pages, with each `VideoGame` as a positioned element. This is what makes "Best Free RTS Games" legible as a ranked recommendation rather than a grid of divs.
- **`Organization`** on the homepage — `name`, `url`, `logo`, `sameAs` for every social profile, `description`. This is the entity record; everything else hangs off it.
- **`WebSite`** with `SearchAction` pointing at `/search?q={query}`.
- **`BreadcrumbList`** on all nested pages.
- **`FAQPage`** on game pages, generated from a new per-game `faq` field (see 4.3).
- **`SoftwareApplication`** on `/launcher`.

**3.7 Fix orphaned pages and the H1 hierarchy.**

- Add `/collections` and a new `/mods` index to the sidebar nav and footer. Point the homepage "See all →" links at `/collections` and `/mods`, not at `/discover#collections` and `/discover`.
- Build the `/mods` index page. ~42 mod detail pages are currently reachable only through eight homepage cards — that is a large block of content Google will likely never crawl deeply.
- The homepage H1 is currently `OpenRA` (the Game of the Week hero). That wastes the site's most important heading on a rotating game name. Make the H1 descriptive — *"Free, Open-Source Games Worth Your Time"* — and demote the hero game title to an H2.

**3.8 Add `llms.txt`.** Serve a plain-text catalog summary at `/llms.txt` via a route handler, generated from the live catalog. Adoption is not universal, but the cost is one small file and it is becoming a de facto convention:

```
# PlayBound
> Curated directory of free, open-source games. Every title is genuinely
> free — no trials, no pay-to-win, no disappearing servers. One editor's
> pick published every Friday.

## Games
- [OpenRA](https://playbound.club/games/openra): Free open-source RTS
  recreating Command & Conquer. 350 MB, GPL-3.0, Win/macOS/Linux.
...

## Collections
- [Best Free RTS Games](https://playbound.club/collections/best-rts-games): 5 titles
...
```

Also serve per-page markdown at `/games/[slug].md` — a clean, chrome-free version of each game page. Cheap to generate from existing data, and it gives fetching agents an unambiguous parse target.

### P2 — Weeks 4–12.

- **`ImageObject`** markup and descriptive alt text on all covers and screenshots. Current alt text is `"{title} cover"` — replace with something that describes the image.
- **`lastmod` accuracy** in the sitemap once games carry an `updatedAt` field.
- **Live server data as structured output.** `/servers` shows real-time player counts. Expose it as a documented JSON endpoint — it is genuinely unique data nobody else publishes, and it is exactly the kind of thing that gets cited and linked.
- **Core Web Vitals pass** once real traffic exists. `next/image` is already in use with `q=75`; verify LCP on game hero images.
- **Google Search Console + Bing Webmaster Tools** verification and sitemap submission. Bing matters disproportionately here: it powers ChatGPT search grounding.

---

## 4. Content strategy

### 4.1 The keyword tiers

**Tier 1 — Win these first (low difficulty, exact intent match).**

Per-game long-tail. Roughly 12 patterns × 18 games = ~216 addressable queries today, growing by 12 with every game added:

- `{game} download free` · `how to install {game}` · `{game} system requirements`
- `is {game} free` · `{game} multiplayer servers` · `{game} mods`
- `{game} vs {competitor}` · `games like {game}` · `{game} review`
- `{game} steam deck` · `{game} linux` · `{game} beginner guide`

These are winnable at DR 0 because the current results are GitHub wikis and forum threads — no page is *designed* to answer them. This is the whole first-year keyword base.

Note the quality-qualified variants, which are the most valuable subset because they select for exactly the intent PlayBound serves: `is {game} actually good` · `is {game} worth playing` · `{game} honest review` · `is {game} still active`. Criterion 3 of the Bar (actively maintained) makes that last pattern answerable in a way no static listicle can match.

**Tier 2 — Category terms (build toward, months 3–9).**

`best free open source games` · `best free rts games` · `free open source strategy games` · `open source alternatives to {commercial game}` · `best free games for linux` · `free games under 500mb` · `free lan party games` · `best free games no download` · `free games like age of empires` · `open source games for steam deck`

Quality-intent category terms are a distinct and softer cluster — chase these hardest, because the incumbent directories structurally cannot serve them: `free games that are actually good` · `best free games no pay to win` · `high quality free games` · `free games worth playing` · `genuinely free games` · `free games without microtransactions` · `best maintained open source games`.

Incumbents here (slant.co, sourceforge, fossgames.com, open-source-games.com, techbloat) are thin, stale, and mostly un-curated. Beatable with genuinely better pages.

**Tier 3 — Head terms (year two, from earned authority).**

`free games` · `free pc games` · `best free pc games` · `free games to download`. Locked by DR 85+ publishers. Revisit only after PlayBound clears roughly DR 30 and holds Tier 2.

**Tier 4 — Brand.**

`playbound` · `playbound games` · `playbound weekly` · `playbound launcher`. Zero volume today. Growing this is the most underrated line item in the whole plan — brand search volume is one of the strongest observed correlates of AI assistant citation, and the newsletter is a direct brand-search engine.

### 4.2 URL architecture to add

```
/weekly                          Weekly archive index          ← build first
/weekly/[year]-w[nn]-[slug]      Individual issue, permanent
/games/[slug]/install            Dedicated install guide, per OS
/games/[slug]/servers            Server browser, own URL (not ?tab=)
/compare/[slug-a]-vs-[slug-b]    Head-to-head comparisons
/alternatives/[commercial-game]  "Free alternatives to Age of Empires"
/guides/[topic]                  Evergreen editorial
/standards                       The PlayBound Bar — the published quality criteria
/not-here                        Notable free games that failed the bar, and why
/mods                            Mods index (currently missing)
/collections                     Surface in nav (currently orphaned)
```

Two notes on this. First, **promote the high-intent tabs to real URLs.** `?tab=servers` and `?tab=mods` hold the most commercially valuable content on the site and neither can rank as a query parameter. Give install and servers their own indexable URLs; leave low-value tabs (achievements, discussion) as params behind the canonical.

Also promote the `/discover?filter=` facets. `?filter=hidden`, `?filter=browser` and friends are genuinely useful landing concepts trapped in query parameters. Either give the valuable ones real URLs (`/discover/hidden-gems`) or self-canonicalise them — but do not leave them as uncontrolled params.

Second, **`/alternatives/` is the sharpest wedge in this document.** Someone searching "free alternative to Age of Empires" or "open source SimCity" has commercial intent, no budget, and no good destination — the current answers are Reddit threads. PlayBound's catalog maps almost perfectly onto this frame:

| Commercial game | PlayBound answer |
|---|---|
| Command & Conquer / Red Alert | OpenRA |
| Age of Empires | 0 A.D. |
| Total Annihilation / Supreme Commander | Beyond All Reason, Zero-K |
| Transport Tycoon / Cities: Skylines | OpenTTD |
| Minecraft | Luanti |
| Worms | Hedgewars |
| Mario Kart | SuperTuxKart |
| Factorio | Mindustry |
| Quake / Unreal Tournament | Xonotic |
| Diablo | Veloren, Shattered Pixel Dungeon |
| Elite Dangerous / Escape Velocity | Endless Sky, Naev |
| Super Mario Bros. | SuperTux |

That is twelve high-intent pages available from the existing catalog with no new games required.

### 4.3 Fix the thin content problem

Game pages carry ~44 words of unique prose. That is not enough to rank, and not enough for an LLM to extract a substantive claim from. Extend the `Game` type and backfill:

```ts
interface Game {
  // ...existing
  longDescription: string;      // 400–600 words, unique editorial
  whyWePickedIt: string;        // 100 words, first-person curation POV
  qualityBar: {                 // scored against the five published criteria
    genuinelyFree: boolean;
    finished: boolean;
    activelyMaintained: boolean;
    standsAlone: boolean;
    wontDisappear: boolean;
    verdict: string;            // one-sentence quotable summary
    lastVerified: string;       // ISO date — recency is a citation signal
  };
  installSteps: InstallStep[];  // per-platform, structured
  faq: { q: string; a: string }[];  // 5–8 entries → FAQPage schema
  bestFor: string[];            // "solo campaign", "LAN", "low-spec laptop"
  notFor: string[];             // honest limitations
  comparableTo: string[];       // commercial games it resembles
  updatedAt: Date;
}
```

`qualityBar` is the centrepiece. Rendering the five criteria as a visible, dated checklist on every game page does three things at once: it proves the standard is applied rather than claimed, it produces a compact extractable block that is close to ideal for LLM citation, and `lastVerified` supplies the recency signal that models weight heavily. `verdict` should be written as a self-contained quotable sentence — *"OpenRA clears all five: genuinely free, actively maintained as of July 2026, and good enough to recommend at full price."*

`whyWePickedIt` and `notFor` matter more than their word count suggests. Editorial judgment and stated limitations are exactly what distinguishes a citable source from a scraped directory — and `notFor` in particular is the kind of honest signal that both reviewers and language models weight heavily. Nobody else in this niche publishes it.

**Sequencing given weekly cadence:** the Friday pick gets its full treatment that week. Backfill the existing 18 at roughly two per week alongside. Full catalog depth in ~9 weeks.

---

## 5. The Weekly flywheel

The newsletter is the growth engine, not a side channel. One pick per week should produce a full content cluster, every week, forever:

```
Friday's pick
├─ Newsletter issue                      → email, drives direct + brand search
├─ /weekly/2026-w31-openra               → permanent, dated, citable archive page
├─ Full game page treatment              → longDescription, FAQ, install guide
├─ /games/[slug]/install                 → captures "how to install X"
├─ 1 comparison page                     → /compare/openra-vs-warzone-2100
├─ 1 alternatives page                   → /alternatives/command-and-conquer
├─ Collection membership updates         → internal links to 2–4 collections
└─ Distribution: r/opensourcegames, r/linux_gaming, HN, the game's own forum
```

Eight assets per week from one editorial decision, using a process that is already quick. Fifty-two weeks compounds to roughly 400 pages of genuinely unique, editorially-defensible content — which is more than any incumbent in this niche has.

Three specifics that make the archive work:

1. **Date every issue visibly**, in the page body and in `datePublished`. LLMs strongly prefer sources with legible recency, and "PlayBound's pick for week 31 of 2026" is a far more citable statement than an undated listicle.
2. **Never break an archive URL.** These accumulate links; they are the long-term asset.
3. **Make the archive index skimmable** — a table of every pick with date, genre, size and one-line verdict. That table format is close to ideal for LLM extraction, and it is the page most likely to be cited as "PlayBound's picks."

---

## 6. LLM citation strategy

### 6.1 What the research actually showed

Test queries against live AI search produced a consistent pattern. For `best free open source games 2026`, the cited sources were slant.co, a SourceForge directory, fossgames.com, open-source-games.com and techbloat. For `Beyond All Reason vs Zero-K vs 0 A.D.`, the answer was assembled from the games' own FAQs, Wikipedia, alternativeto.net, a Quarter To Three forum thread and Steam discussions. For `how to install OpenRA multiplayer servers`, it came from openra.net's book, the GitHub wiki, and forum posts.

Two conclusions follow.

**No curation authority exists in this space.** Every cited source is either a first-party project page, an un-curated directory, or a forum. When someone asks "which free RTS should I play," the model is *inventing* a comparison from scattered fragments because no page presents one. That is a structural gap, and it is the position PlayBound should occupy.

**The comparison layer is completely unclaimed.** `alternativeto.net` is the nearest thing to a competitor and it is a bare voting list with no editorial reasoning. A page that says "here is the difference between BAR and Zero-K, here is who each is for, here is what neither does well" has no incumbent to displace.

### 6.2 How to get cited

**Be extractable.** Models cite what they can lift cleanly. Structure every substantive page so the answer is liftable without inference:

- Lead with the direct answer, then support it. Never bury the verdict below a preamble.
- Use question-shaped H2s that mirror real queries: "Is OpenRA free?" "What are OpenRA's system requirements?"
- Put comparative data in real HTML tables. Tables get extracted; prose gets paraphrased.
- Write self-contained factual sentences. *"OpenRA is a free, open-source real-time strategy game released in 2010 under GPL-3.0, available for Windows, macOS and Linux as a 350 MB download."* One sentence, seven citable facts, no context required.
- State numbers precisely — sizes, dates, licences, player counts, version numbers.

**Be attributable.** A model needs a reason to name PlayBound rather than restate the fact anonymously. That reason has to be something only PlayBound can supply:

- **The PlayBound Bar.** A named, published, five-criterion standard applied consistently and dated. This is the single most citable asset in the plan — *"PlayBound, which only lists free games meeting its five-point standard, rates…"* A model citing a *criterion* has to name the source; a model citing a plain fact does not.
- **Editorial verdicts.** "PlayBound's pick for week 31." "PlayBound rates this the best free RTS for newcomers." Attributed opinions get quoted *with* the attribution; commodity facts do not.
- **Maintenance status, verified and dated.** "Actively maintained as of July 2026" is a fact with a shelf life, which means it must be re-fetched rather than recalled from training data. That is precisely the condition under which models cite a live source.
- **Live server data.** Real-time player counts across every title in the catalog. Nobody else publishes this. Verifiable, unique, and inherently quotable — *"as of July 2026, OpenTTD had 99 players across 100 public servers (PlayBound)."*
- **Normalised catalog data.** Consistent size, licence, platform and Steam Deck compatibility across every title. Individually trivial, collectively a dataset — and the only place it exists in one shape.
- **Proprietary framing.** Coin and consistently use terms like *"genuinely free"* (no trials, no pay-to-win, no server shutdown risk) or a *"PlayBound Free Test."* Named frameworks travel; they get cited by name, and they pull the brand along.

**Be an entity, not just a site.** Models resolve brands through corroborating references across independent sources. This is a distribution problem, not a content problem:

- **Wikipedia and Wikidata.** Contribute accurately to the articles for games in the catalog. Do not spam links — build a legitimate edit history. A Wikidata item for PlayBound itself, once notability supports it, is high-value.
- **Get listed on the directories that get cited.** alternativeto.net, Product Hunt, SaaSHub, Slant, AlternativeTo's game entries.
- **Be present in the communities models train on.** r/opensourcegames, r/linux_gaming, r/lowendgaming, r/RealTimeStrategy, Hacker News, Lemmy. Participate genuinely — the goal is that "PlayBound" appears in organic discussion, not that links appear.
- **Consistent NAP-style consistency.** Identical name, description and logo everywhere. Entity resolution depends on it.

**Be crawlable by AI agents specifically.** Covered in 3.2 and 3.8: explicit allows for GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot; `llms.txt`; markdown mirrors. Also — server-render everything that matters. Most AI fetchers do not execute JavaScript. PlayBound is already server-rendered, which is a real advantage over the JS-heavy game directories it competes with; do not regress it.

### 6.3 Priority pages for citation

Ranked by likelihood of being quoted:

1. `/standards` — the named framework; everything else derives authority from it
2. `/weekly` archive — dated, editorial, tabular, unique
3. `/compare/[a]-vs-[b]` — fills the exact gap the research exposed
3. `/alternatives/[commercial-game]` — high-intent, no incumbent
4. `/games/[slug]/install` — models love step-by-step procedures
5. `/collections/[slug]` — "best free X" queries, `ItemList` schema
6. `/servers` — unique live data
7. Game pages with full FAQ — direct question-answer matching

---

## 7. Links and authority

DR 0 with no profile. The realistic route in this niche is contribution, not outreach:

- **Contribute upstream.** Fix documentation, submit patches, improve wikis for games in the catalog. Contributor credits and project-site links follow naturally and carry real weight — these are high-DR, topically perfect domains.
- **Publish the server data.** A free, documented API for live open-source game server counts is a genuine developer resource. Developer tools attract links without asking.
- **Be the LAN-party reference.** "The definitive free LAN party game guide" is a real gap with obvious linkers.
- **Newsletter as a link source.** Weekly picks give the featured project something to share. Projects link back to coverage.
- **Hacker News and Lemmy.** Both index well and the FOSS-gaming audience lives there.
- **Avoid** paid links, mass guest posting, and directory spam. At DR 0 there is no buffer for a penalty.

---

## 8. Measurement

**Search:** GSC impressions/clicks/position for the Tier 1 pattern set · indexed page count vs sitemap count · DR and referring domains monthly · Tier 2 category rankings.

**LLM citation:** monthly manual runs of a fixed 25-query set (ChatGPT, Claude, Perplexity, Google AI Mode) logging whether PlayBound is cited, mentioned, or absent. Track share of voice against slant.co, sourceforge, fossgames.com, alternativeto.net. Ahrefs Brand Radar is connected here and can automate this once the plan is upgraded. Also monitor server logs for GPTBot / ClaudeBot / PerplexityBot hit rates — crawl frequency is the leading indicator.

**Business:** newsletter subscribers and growth rate · brand search volume for "playbound" · launcher installs · organic → install conversion.

**Rough targets.** Month 3: indexed and crawled cleanly, Tier 1 impressions climbing, first AI citations on per-game queries. Month 6: Tier 2 top-20 for several category terms, DR 10+, regular citation on comparison queries. Month 12: Tier 2 top-5, DR 25+, ~400 archive/cluster pages, cited as a named authority in the open-source games space.

---

## 9. Implementation order

> **Status:** weeks 1–12 are implemented in code as of 29 July 2026 — see
> [SEO-IMPLEMENTATION.md](./SEO-IMPLEMENTATION.md) for what shipped, what still
> needs a human, and the three blocking manual steps (Vercel domain redirect,
> `NEXT_PUBLIC_SITE_URL`, deleting one leftover directory). The checklist below
> is retained as the reasoning record.

**Week 1 — unblock indexing**

- [ ] Point `playbound-five.vercel.app` at `playbound.club` as a redirect; set Production domain in Vercel
- [ ] Hardcode `metadataBase` via `NEXT_PUBLIC_SITE_URL`
- [ ] Ship `src/app/robots.ts` (incl. AI crawler allows, non-prod disallow)
- [ ] Ship `src/app/sitemap.ts` from live catalog
- [ ] `noindex` on `/admin`, `/library`, `/profile`, `/login`, `/signup`, `/verify-email`, `/launcher/auth`
- [ ] Verify in Google Search Console + Bing Webmaster Tools; submit sitemap

**Week 2 — metadata and canonicals**

- [ ] Real `generateMetadata` for games, collections, mods, developers
- [ ] `alternates.canonical` on every page (kills `?tab=` duplication)
- [ ] Descriptive homepage H1; demote hero game title to H2
- [ ] Add `/collections` and `/mods` to sidebar + footer; fix "See all →" targets
- [ ] Build the `/mods` index page

**Weeks 3–4 — structured data**

- [ ] `<JsonLd>` component
- [ ] `VideoGame` + `Organization` + `WebSite`/`SearchAction` + `BreadcrumbList`
- [ ] `ItemList` on collections
- [ ] Validate everything in Google Rich Results Test

**Weeks 4–6 — content foundation**

- [ ] Extend `Game` type (`longDescription`, `whyWePickedIt`, `installSteps`, `faq`, `bestFor`, `notFor`, `comparableTo`, `updatedAt`)
- [ ] Admin UI fields for the above, so weekly additions capture them at entry
- [ ] Build `/weekly` archive index + issue template
- [ ] Build `/games/[slug]/install`
- [ ] `FAQPage` schema wired to the `faq` field
- [ ] Ship `/llms.txt` + `/games/[slug].md` mirrors

**Weeks 6–12 — scale the flywheel**

- [ ] Backfill all 18 existing games to full depth (~2/week)
- [ ] Ship the 12 `/alternatives/` pages from the mapping in 4.2
- [ ] Ship the first 6 `/compare/` pages
- [ ] Promote `?tab=servers` to `/games/[slug]/servers`
- [ ] Publish the live server data API
- [ ] Establish weekly distribution rhythm (Reddit, HN, project forums)
- [ ] Begin Wikipedia/Wikidata contribution
- [ ] Submit to alternativeto.net, Product Hunt, Slant, SaaSHub
- [ ] First monthly LLM citation audit against the fixed 25-query set

---

## 10. Keywords to validate

Ahrefs paid endpoints are unavailable on the current plan. Upgrade a seat and pull volume, difficulty and traffic potential for these before finalising Tier 2 priorities:

**Category:** best free open source games · best free rts games · free open source strategy games · best free games for linux · free games under 500mb · free lan party games · open source games for steam deck · best free games no download · free open source multiplayer games · foss games

**Alternatives:** free alternative to age of empires · open source command and conquer · free minecraft alternative · open source simcity · free alternative to factorio · open source transport tycoon · free worms alternative · free mario kart alternative

**Per-game (sample across the pattern set):** openra download · 0 a.d. game · beyond all reason download · mindustry free · endless sky game · zero-k rts · openttd download · luanti minecraft · warzone 2100 · xonotic

**Comparison:** beyond all reason vs zero-k · openra vs red alert · 0 ad vs age of empires · luanti vs minecraft · mindustry vs factorio

Also run `site-explorer-organic-keywords` against the incumbents — slant.co, fossgames.com, open-source-games.com, alternativeto.net — to harvest what they already rank for. That is the fastest route to a validated Tier 2 list.

---

## Sources

- [Slant — 98 Best open-source games as of 2026](https://www.slant.co/topics/1933/~best-open-source-games)
- [SourceForge — Best Open Source Windows Games 2026](https://sourceforge.net/directory/games/)
- [FOSS Games](https://fossgames.com/)
- [Open Source Games — Best Open Source Strategy Games 2026](https://www.open-source-games.com/category/best-open-source-strategy-games)
- [GamesRadar+ — The 25 best free PC games to play in 2026](https://www.gamesradar.com/best-free-pc-games-to-play-now/)
- [GameSpot — 15 Best Free PC Games To Play In 2026](https://www.gamespot.com/gallery/best-free-pc-games/2900-6309/)
- [PCGamesN — The best free PC games 2026](https://www.pcgamesn.com/100-best-free-pc-games)
- [Beyond All Reason FAQ — Differences between BAR and Zero-K](https://www.beyondallreason.info/faq/what-are-the-differences-between-bar-and-zerok)
- [AlternativeTo — Beyond All Reason alternatives](https://alternativeto.net/software/beyond-all-reason/)
- [The OpenRA Book — Installing](https://www.openra.net/book/playing/installing.html)
- [OpenRA Wiki — Dedicated Server](https://github.com/OpenRA/OpenRA/wiki/Dedicated-Server)
- [Quarter To Three — Beyond All Reason vs. Zero-K vs. Ashes of Singularity 2](https://forum.quartertothree.com/t/beyond-all-reason-vs-zero-k-vs-ashes-of-singularity-2/167159)
- [TechPP — 13 Best Websites to Download Free PC Games in 2026](https://techpp.com/2026/04/02/best-websites-to-download-free-pc-games/)
