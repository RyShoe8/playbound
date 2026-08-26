# PlayBound — SEO & LLM Citation Strategy

**Revised:** 26 August 2026 · playbound.club
**Supersedes:** the 29 July 2026 version, archived at
[SEO-STRATEGY-2026-07-29-archived.md](./SEO-STRATEGY-2026-07-29-archived.md)
**Catalog:** ~86 games · ~477 mods · one pick every **Wednesday**

> **Why this was rewritten.** The July strategy was built on a product that no longer
> exists. It assumed an 18–21 game open-source-only catalog and a five-criterion Bar
> whose fifth criterion required open source or self-hosting. It argued explicitly that
> PlayBound *cannot* win "free games" because that term "resolves to live-service
> free-to-play, which is not what PlayBound stocks."
>
> PlayBound now stocks exactly that. The Bar is four criteria, open source is a
> nice-to-have rather than a gate, and the catalog runs from Wesnoth to VALORANT to a
> $12 Morrowind. The old sequencing advice — *niche now, broad later, don't chase
> "best free PC games" in year one* — is now pointed the wrong way.
>
> The technical foundation from the old plan shipped and is still correct; see
> [SEO-IMPLEMENTATION.md](./SEO-IMPLEMENTATION.md). What follows replaces the thesis,
> the keyword strategy and the content model built on top of it.

---

## 1. The bet, in one paragraph

**The catalog gets people in the door; the play layer is what nothing else answers.**
Curation alone was a defensible thesis at 21 hand-picked open-source titles. At 86
games including League of Legends and VALORANT, "we curated these" is a weaker claim —
the reader already knows those games, and a hundred sites list them. What no site
answers well is the question that comes *after* choosing a game: **how do I actually
play this with my friends tonight?** PlayBound Connect works through CGNAT with no port
forwarding, its virtual-LAN adapter makes local-network-only games playable with remote
friends, and Couch Mode turns any phone into a controller with no account or driver.
Those capabilities generate high-intent, low-difficulty search demand that currently
resolves to a decade of stale forum threads and Hamachi tutorials. That is the winnable
ground.

**Sequencing:** own the play-layer and per-game long-tail first — they are winnable now
and nobody has built for them. Category and head terms follow from that authority, and
unlike in the July plan they are no longer off the table, because the catalog now
genuinely serves the intent behind them.

### 1.1 The quality bar is still a publishable asset

Curation only functions as a moat if the standard is explicit and checkable. The
current Bar, published at `/standards`:

> 1. **Worth the cost** — free, or regularly available for $15 or less.
> 2. **Ready to play** — playable and satisfying today. It can be unfinished; it cannot be unfun.
> 3. **Tested by PlayBound** — we install it, launch it, and play it ourselves.
> 4. **That One Thing** — every game needs that one thing we'd excitedly tell our friends about.

Criteria 3 and 4 are the citable ones now, and they are *better* than what they
replaced. "Tested by PlayBound" is a first-hand-experience claim no scraped directory
can make, and it lands directly on Google's demonstrated preference for first-hand
experience. "That One Thing" is a named editorial framework — frameworks get quoted by
name, and the brand travels with them.

Two consequences carry over from the old plan and are still right:

**Publish the rejections.** A `/not-here` page explaining which well-known games failed
the Bar and why is the strongest possible proof the standard is real. It is *more*
valuable now than it was in July, not less: with commercial F2P in the catalog, readers
will reasonably ask what the standard actually excludes. Pay-to-win, paywalled cores
and games that are simply not fun are the answer, and each one is a page.

**Never pad the catalog.** Every marginal title weakens the only thing that
distinguishes 86 curated games from a directory of 8,600.

**What has to change downstream.** The old five booleans (`genuinelyFree`, `finished`,
`activelyMaintained`, `standsAlone`, `wontDisappear`) are dead and must be replaced
wherever they appear in the data model, the scorecard component and the schema output.

---

## 2. Where things stand

The July technical audit is obsolete — that work shipped. `robots.txt` is live with
explicit allows for ClaudeBot, GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended
and others, plus `/api/public/` opened to crawlers and a declared host and sitemap.
Sitemap, canonicals, per-page metadata, structured data, `/llms.txt`, `/weekly`,
`/standards`, `/compare`, `/alternatives`, `/collections` and the mods index all
exist. See [SEO-IMPLEMENTATION.md](./SEO-IMPLEMENTATION.md).

What is now wrong is not the plumbing but the assumptions baked into it:

| Surface | Problem introduced by the catalog change |
|---|---|
| Game `generateMetadata` | Template hardcodes "free, open-source" and `game.license` into every description. Wrong and factually false for VALORANT, Morrowind, Warframe |
| `VideoGame` schema | `offers` hardcoded to `price: "0"` — wrong for every ≤$15 title. Emitting a false zero price is a structured-data violation, not just a typo |
| `/llms.txt` | Describes a "curated directory of free, open-source games" with "no disappearing servers," and says picks publish Friday. Three errors in one paragraph |
| Bar scorecard | Renders five criteria that no longer exist |
| `/alternatives` | All twelve pages map to open-source substitutes only. No coverage of the F2P or ≤$15 answer |
| Homepage H1 | Check it still reads descriptively rather than as the rotating pick's title |

Fix the metadata template and the `offers` price first — those two are actively
emitting false claims to crawlers about most of the catalog.

---

## 3. Keyword strategy

### 3.1 Tier 1 — the play layer *(new, and the best tier in this document)*

This did not exist in the July plan and is now the sharpest wedge PlayBound has. Every
pattern below is high-intent, low-difficulty, and currently answered by forum threads
from 2014 and VPN tutorials.

**Per-game multiplayer intent** — roughly 6 patterns across the multiplayer-capable
catalog:

- `how to play {game} with friends` · `{game} multiplayer with friends`
- `{game} lan over internet` · `how to host {game} server`
- `{game} multiplayer not working` · `{game} co-op how many players`
- `{game} dedicated server hosting` · `is {game} cross platform`

**Generic play-layer intent** — the tools people currently reach for:

- `hamachi alternative` · `radmin vpn alternative` · `zerotier gaming`
- `how to play lan games over internet` · `play lan games online with friends`
- `port forwarding alternative gaming` · `cgnat gaming multiplayer`
- `free games to play with friends` · `games to play with friends no download`

**Couch Mode intent** — an entire cluster with a genuinely novel answer:

- `use phone as controller pc` · `phone as xbox controller` · `android as pc gamepad`
- `play games with one controller` · `local multiplayer without controllers`
- `free couch co-op games pc` · `party games for pc with friends`

Every one of these is winnable at low authority because the incumbent results are
tutorials for tools that are harder to use than PlayBound. Each also has an obvious
supporting asset: a thirty-second clip that doubles as the marketing material.

### 3.2 Tier 1 — per-game long-tail

Still the base of the plan, and roughly four times larger than in July at ~86 games:

- `{game} download free` · `how to install {game}` · `{game} system requirements`
- `is {game} free` · `{game} mods` · `{game} vs {competitor}` · `games like {game}`
- `{game} steam deck` · `{game} linux` · `{game} beginner guide`

Quality-qualified variants remain the most valuable subset because they select for
exactly the intent PlayBound serves: `is {game} actually good` · `is {game} worth
playing` · `{game} honest review` · `is {game} still active` · `is {game} pay to win`.
That last one is newly important — with commercial F2P in the catalog it is the
question readers most want answered, and criterion 1 makes it answerable.

### 3.3 Tier 2 — category terms

The July list was almost entirely `open source X`. Keep those for the open-source slice
of the catalog and the incoming queue, but they are now one cluster of three:

- **Open source:** `best free open source games` · `open source alternatives to {game}` · `best free games for linux` · `foss games` · `open source games for steam deck`
- **Free-to-play quality:** `best free to play games` · `free games that are actually good` · `best f2p games no pay to win` · `free games without microtransactions` · `best free multiplayer games` · `free games worth playing`
- **Cheap-and-good (new, and uncontested):** `best games under $15` · `best cheap pc games` · `good games under 10 dollars` · `best cheap co-op games` · `cheap games to play with friends`

The cheap-and-good cluster is the one to move on first. It is a real recurring purchase
question, the incumbents are all seasonal-sale listicles rather than standing
recommendations, and criterion 1 gives PlayBound a permanent, principled answer where
everyone else has a Steam-sale snapshot.

### 3.4 Tier 3 — head terms *(no longer year two)*

`free pc games` · `best free pc games` · `free games to download` · `free multiplayer
games`. The July plan ruled these out on the grounds that they resolve to live-service
F2P that PlayBound didn't stock. That objection is gone. These are still hard — DR 85+
publishers with long link profiles — so they are not a year-one *priority*, but they
should now be built toward deliberately rather than written off, and the catalog should
be shaped with them in mind.

### 3.5 Tier 4 — brand

`playbound` · `playbound launcher` · `playbound connect` · `playbound weekly`. Still
the most underrated line item: brand search volume is one of the strongest observed
correlates of AI assistant citation, and it is the only tier where the newsletter, the
launcher and word of mouth all compound into the same term.

---

## 4. Content architecture

### 4.1 Pages to add

```
/play-with-friends/[slug]        How to play {game} with friends — per game
/guides/lan-over-internet        The evergreen anchor for the Hamachi/CGNAT cluster
/guides/phone-as-controller      Couch Mode anchor
/collections/under-15            The cheap-and-good cluster's landing page
/collections/free-with-friends   Free multiplayer, sorted by how easy it is to start
/not-here                        Games that failed the Bar, and why
/alternatives/[game]             Extend beyond open-source substitutes (below)
```

`/play-with-friends/[slug]` is the highest-value new template in this document. It
answers a question with real volume, it is generatable from data PlayBound already has
(the adapter type, player counts, whether Connect hosts it, whether Couch Mode applies),
and no competitor can produce it because no competitor knows the answer.

**One honest constraint:** games on the `official` adapter — CS2, VALORANT, League —
get party presence and launch only. Their `/play-with-friends` pages must say so
plainly. Writing them as though Connect does something it doesn't will produce the
bounce and the bad review that undo the whole cluster.

### 4.2 Rebuild `/alternatives`

The existing twelve pages map paid games to open-source substitutes and are still good.
But the catalog now supports two more framings of the same high-intent query, and
"free alternative to X" searchers rarely care whether the answer is open source:

| Query shape | Old answer only | Now also |
|---|---|---|
| free alternative to Age of Empires | 0 A.D. | — |
| free alternative to Overwatch | *(none)* | Team Fortress 2, THE FINALS |
| free alternative to Diablo IV | Veloren | Path of Exile |
| free alternative to WoW | *(none)* | Guild Wars 2, LOTRO, Albion Online |
| cheap alternative to Baldur's Gate 3 | *(none)* | KOTOR I & II |
| cheap alternative to Civilization VII | Freeciv | HoMM III |
| free alternative to Genshin | *(none)* | Where Winds Meet |

Each row is a page with commercial intent, no budget attached, and no good destination
today. This is the fastest content expansion available from the existing catalog with
no new games required.

### 4.3 The game data model

The July `Game` type extension was right in structure and wrong in specifics. Replace
the `qualityBar` block:

```ts
interface Game {
  // ...existing
  longDescription: string;        // 400–600 words, unique editorial
  whyWePickedIt: string;          // 100 words, first-person curation POV
  bar: {
    worthTheCost: boolean;
    readyToPlay: boolean;
    testedByPlayBound: boolean;
    thatOneThing: string;         // the actual thing — quotable, not a boolean
    verdict: string;              // one self-contained quotable sentence
    lastVerified: string;         // ISO date — recency is a citation signal
  };
  price: { amount: number; currency: "USD"; model: "free" | "f2p" | "paid" };
  multiplayer: {
    adapter: "managed-server" | "virtual-lan" | "playbound-native" | "direct-ip" | "official";
    maxPlayers?: number;
    couchMode: boolean;
    crossPlatform: boolean;
  };
  installSteps: InstallStep[];
  faq: { q: string; a: string }[];
  bestFor: string[];
  notFor: string[];
  comparableTo: string[];
  updatedAt: Date;
}
```

Two changes carry most of the value. **`thatOneThing` should be a string, not a
boolean** — it is the single most quotable field on the page and the only one an LLM
cannot paraphrase away without attribution. And **`multiplayer` and `price` become
first-class fields** because they now drive the two best content clusters in the plan;
they should not live as prose anyone has to parse.

`notFor` matters more than its word count suggests. Stated limitations are exactly what
distinguishes a citable source from a scraped directory, and with commercial F2P in the
catalog, honest notes on monetisation pressure are the most trust-building thing on the
page.

**Sequencing:** the Wednesday pick gets full treatment that week. Backfill the rest at
roughly three per week, prioritised by multiplayer capability — the games where Connect
does something interesting earn their pages back fastest.

---

## 5. The Weekly flywheel

The newsletter is the growth engine, not a side channel. **Wednesdays**, not Fridays as
the old doc had it. One pick should produce a full cluster:

```
Wednesday's pick
├─ Newsletter issue                    → email, drives direct + brand search
├─ /weekly/{year}-w{nn}-{slug}         → permanent, dated, citable archive page
├─ Full game page treatment            → longDescription, bar, FAQ, price, multiplayer
├─ /games/{slug}/install               → captures "how to install X"
├─ /play-with-friends/{slug}           → the new cluster; only where Connect adds something
├─ 1 comparison or alternatives page   → commercial intent
├─ Collection membership updates       → internal links
└─ 2 clips of it actually working      → distribution, and the press pitch asset
```

Three specifics that make the archive work, all still true: date every issue visibly
and in `datePublished`; never break an archive URL; keep the archive index a skimmable
table, which is close to ideal for LLM extraction and is the page most likely to be
cited as "PlayBound's picks."

**Note:** the `/weekly` archive currently surfaces very few issues. Whatever the cause —
sparse backfill or a listing bug — the archive is the compounding asset here, and an
archive that doesn't list its own issues can't accumulate anything.

---

## 6. LLM citation strategy

The July research still holds and is worth restating: for queries in this space, models
assemble answers from project FAQs, GitHub wikis, Wikipedia, alternativeto.net and
forum threads, because **no curation authority exists**. That gap is unchanged.

### 6.1 Be extractable

Unchanged from the July plan and still correct:

- Lead with the direct answer, then support it. Never bury the verdict.
- Question-shaped H2s that mirror real queries: "Is Warframe pay to win?" "Can you play Heroes III multiplayer online?"
- Comparative data in real HTML tables. Tables get extracted; prose gets paraphrased.
- Self-contained factual sentences with precise numbers, dates, sizes, prices, licences.
- Server-render everything that matters. Most AI fetchers do not execute JavaScript.

### 6.2 Be attributable — on the current claims

A model needs a reason to name PlayBound rather than restate a fact anonymously. The
July version of this list leaned on "genuinely free" and "won't disappear," both of
which are gone. The current sources of attribution:

- **"Tested by PlayBound."** A first-hand-play claim. No directory can make it, and it is the kind of statement that gets quoted *with* its source.
- **"That One Thing."** A named editorial framework, one quotable sentence per game.
- **The four-point Bar, applied and dated.** A model citing a *criterion* has to name the source; a model citing a plain fact does not.
- **Multiplayer capability data.** Which games work through CGNAT, which support virtual LAN, which have phone-controller support, how many players. Nobody else has this dataset in any form.
- **Live server and player-count data.** Real-time, verifiable, unique, and inherently quotable.
- **Normalised catalog data** — price, size, platform, Deck compatibility across 86 titles in one consistent shape.

### 6.3 Be an entity

A distribution problem, not a content problem, and covered in the marketing plan:
contribute genuinely to Wikipedia and Wikidata for games in the catalog without link
spam; get listed on the directories models actually cite (AlternativeTo, Product Hunt,
Slant, SaaSHub, osgameclones, LibreGameWiki); be present in the communities models
train on. Keep name, description and logo identical everywhere — entity resolution
depends on it.

### 6.4 Priority pages for citation

1. `/standards` — the named framework; everything else derives authority from it
2. `/play-with-friends/[slug]` — answers a question with no incumbent at all
3. `/weekly` archive — dated, editorial, tabular, unique
4. `/alternatives/[game]` — high commercial intent, weak incumbents
5. `/compare/[a]-vs-[b]` — fills the gap the research exposed
6. `/games/[slug]/install` — models favour step-by-step procedures
7. `/not-here` — the proof the standard is real
8. `/servers` — unique live data

---

## 7. Links and authority

The realistic route in this niche is contribution, not outreach. Still true, with one
addition:

- **Contribute upstream** to the open-source projects in the catalog. Contributor credits and project-site links follow naturally from high-DR, topically perfect domains.
- **Ship a README badge** for catalog projects. The most durable organic link loop in open source, and it scales with the incoming open-source queue.
- **Publish the server data API.** A free, documented endpoint for live player counts is a genuine developer resource, and developer tools attract links without asking.
- **Own the LAN-over-internet reference.** The definitive, tool-agnostic guide to playing local-only games with remote friends is a real gap with obvious linkers, and it anchors the best keyword cluster in this document.
- **Newsletter as a link source.** Weekly picks give the featured project something to share.
- **Avoid** paid links, mass guest posting and directory spam. There is no authority buffer for a penalty.

---

## 8. Measurement

**Search:** GSC impressions/clicks/position, segmented by the three clusters (play
layer, per-game long-tail, cheap-and-good) rather than in aggregate — they will move at
very different rates and an aggregate number hides which bet is working. Indexed pages
vs sitemap count. Referring domains monthly.

**LLM citation:** monthly manual runs of a fixed query set across ChatGPT, Claude,
Perplexity and Google AI Mode, logging cited / mentioned / absent. The set needs
rewriting — the July version was built on open-source queries. Include the play-layer
questions, which are where PlayBound should win first. Monitor server logs for GPTBot /
ClaudeBot / PerplexityBot hit rates; crawl frequency is the leading indicator.

**Business:** newsletter subscribers · brand search volume · launcher installs ·
organic → install conversion · parties started per week.

---

## 9. What to do next, in order

1. **Fix the false claims.** Metadata template ("free, open-source" on every game), `VideoGame` `offers` price hardcoded to zero, `/llms.txt` copy, Bar scorecard rendering five dead criteria. These are actively misinforming crawlers about most of the catalog.
2. **Migrate the data model** — `bar`, `price`, `multiplayer` per 4.3. Everything downstream depends on it.
3. **Ship `/play-with-friends/[slug]`** for the multiplayer-capable catalog, honest about `official`-adapter limits.
4. **Ship `/guides/lan-over-internet` and `/guides/phone-as-controller`** as the evergreen anchors for the two generic clusters.
5. **Ship `/collections/under-15`** and extend `/alternatives` per 4.2.
6. **Ship `/not-here`.**
7. **Fix the `/weekly` archive listing** and backfill issues.
8. **Rewrite the LLM citation query set** and run the first audit against it.

---

## 10. Keywords to validate

Ahrefs paid endpoints were unavailable when the July plan was written; validate before
finalising priorities. Note the list has changed substantially — the open-source terms
are now one cluster among several.

**Play layer:** how to play lan games over internet · hamachi alternative · radmin vpn
alternative · use phone as controller pc · phone as xbox controller · free games to
play with friends · play lan games online · cgnat multiplayer · how to host a game
server for friends

**Cheap and good:** best games under $15 · best cheap pc games · good games under 10
dollars · best cheap co-op games · cheap games to play with friends

**Free-to-play quality:** best free to play games · free games that are actually good ·
best f2p games no pay to win · free games without microtransactions · best free
multiplayer games

**Open source:** best free open source games · best free games for linux · foss games ·
open source games for steam deck · open source alternatives to {game}

**Per-game (sample):** warframe pay to win · team fortress 2 still active · heroes 3
multiplayer online · morrowind worth playing 2026 · openra download · beyond all reason
download · holocure multiplayer

Also run `site-explorer-organic-keywords` against the incumbents to harvest what they
already rank for. The competitive set has widened along with the catalog — alongside
slant.co and fossgames.com, look at the free-to-play and cheap-games listicle publishers.
