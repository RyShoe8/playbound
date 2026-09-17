# New game checklist

> [!IMPORTANT]
> **MANDATORY POLICY FOR ALL AI AGENTS & DEVELOPERS:**
> Every AI agent must read and follow this checklist **before** adding any game to PlayBound.
> **Games must ONLY be entered via a browser and the PlayBound Admin Panel (`/admin/games`).**
> Never create raw, bare catalog rows or bypass the human/browser admin verification workflow.

A catalog row with a title, a working install, and nothing else is not a
finished addition. Work through every item below for each game before
considering it done — this list exists because these steps have been skipped
before, not because they're hypothetical risks.

Do this per game, not per batch. A session that adds three games and defers
editorial/multiplayer/mods "for later" has added three unfinished rows, not
three games.

## 0. Entry Method — Browser & Admin Panel Only

- Always create and manage new games through the **PlayBound Admin Panel** (`/admin/games` or `/admin/games/[slug]`) via the browser subagent or active admin session.
- Ensure all required form fields pass validation before toggling `Published`.
- Never insert unverified draft rows directly into files without clearing the 8-item editorial and verification gates.

## 1. Install — one-click through the launcher wherever possible

- Prefer a recipe the PlayBound Launcher can run unattended: `github-zip`,
  `github-installer`, `github-jar`, `direct-zip`, `direct-7z`,
  `direct-installer`, `direct-exe`, `itch-zip`, `openttd-zip`,
  `locate-then-zip` (see `LAUNCHER_INSTALL_KINDS` in
  `src/lib/launcherInstall.ts`). Anything that gets the player playing without
  leaving PlayBound.
- `steamcmd` / `external` (`steam://run/...`) is the fallback, not the
  default — only when no direct download exists at all.
- If the only "official" download isn't a ready-to-run package — a mod that
  needs a separately-installed base engine, a quest/data file for a launcher
  PlayBound doesn't ship, a source build — don't ship a two-step manual
  install and don't skip the game. Build a real standalone package yourself
  (follow the engine's own distribution/packaging docs), host it (Vercel
  Blob or equivalent), and attach it via the edit page's "Archive staged
  package" flow. The OpenRA/Solarus Zelda XD2 additions are the reference
  case for this.
- Verify: green Install dot for the game on `/admin/games`, and actually run
  the install once.
- **Accurate install size**: Determine and record the real download / installed disk footprint in `sizeMB`. Do not leave placeholder or guessed sizes. Inspect the upstream package archives and extracted folder sizes so the launcher and game cards accurately reflect disk requirements to players.
- **Multi-version & architecture wiring**: Ensure games are wired for all versions, architectures, and platforms they support (Windows 64-bit/32-bit, Linux, macOS). If distinct architectures or engine variations exist (such as legacy 32-bit Windows builds or community forks), create dedicated Editions (`src/lib/data/editions.ts`) or per-platform recipe URLs (`urlLinux`, `urlMac`, `urlMacX64`) so players on any supported configuration have a one-click install.

## 2. Editorial — every field on the edit page, in PlayBound's voice

- Fill Basics, Access & pricing, Taxonomy, and Cover & media completely — not
  left on scraped placeholder text. Try **Refresh media** first; it often
  pulls a real cover, screenshots, and a gameplay video in one click and
  needs no manual upload.
- The Editorial section must clear all 8 completeness items: quality-bar
  verdict, verification date, long description (400–600 words), why we
  picked it, best for (≥2), not for (≥2), FAQ (≥4), install steps.
- Follow the house style, not a template: verdict describes how the game
  *feels* to play (short, present-tense, concrete); long description is
  expository and factual, themed paragraphs, closing on why it matters to
  PlayBound specifically; why-we-picked-it is mission-framed ("We picked X
  because…"), not a personal anecdote. See the `feedback-editorial-voice`
  memory for the full standard and a worked example.
- Before writing, read these published pages as the canonical examples of
  PlayBound's editorial voice:
  - [Marathon 2](https://playbound.club/games/marathon-2) — concrete sensory
    detail, a strong opinion, and historical context without sounding like a
    museum placard.
  - [HoloCure - Save the Fans!](https://playbound.club/games/holocure) — warm,
    delighted, specific, and willing to say when a free game is absurdly more
    generous than expected.
  - [Mega Man Unlimited](https://playbound.club/games/mega-man-unlimited) —
    candid about legal/status caveats while still making a sharp case for why
    the game is worth somebody's time.
- Write like an enthusiastic, well-informed friend who has a point of view.
  Name the weapon, animation, enemy, system, joke, frustration, or surprise
  that makes the game memorable. Prefer vivid claims ("an emulator and a
  prayer," "lost three hours") over category prose ("offers engaging combat
  and progression"). It is fine to be funny, skeptical, delighted, or blunt.
  Do not sound like a press release, encyclopedia entry, store description,
  feature matrix, or AI-generated product summary.
- Every section has a different job: the tagline makes a promise; **That One
  Thing** gives the one detail we would excitedly tell a friend; the long
  description explains what playing actually feels like and names the honest
  catches; **Why we picked it** makes PlayBound's opinion unmistakable. Do not
  repeat the same neutral facts in all four fields.
- PlayBound Bar checkboxes are a claim, not a formality. Only check **Tested
  by PlayBound** after actually installing and playing it yourself. A game
  with that box unchecked stays in **Testing** status, not **Published** —
  publish-readiness (the 8-item checklist) and hands-on verification are two
  different gates; clearing the first never implies the second.

## 3. Multiplayer — wire into Connect and the party system

- Determine honestly whether the game has real multiplayer (a dedicated
  server binary, or genuine peer/LAN hosting) — don't assume no just because
  it wasn't obvious from the store page.
- If yes, register it: `HOSTABLE_GAMES` (`src/lib/gameHost/catalog.ts`) for a
  PlayBound-run dedicated server, `MULTIPLAYER_ADAPTERS`
  (`src/lib/multiplayer/adapters.ts`) with the correct `adapterType`, and a
  recipe in `game-host/recipes.js` if PlayBound hosts it.
- Get the client join syntax right, and don't assume `{host}`/`{port}`
  templating in the catalog's `connectArgs` is enough on its own — some
  engines need something the catalog can't express cleanly (an explicit mod,
  a specific launch flag). Check whether `launcher/services/connectArgs.js`
  needs an override rather than relying on catalog data alone. The OpenRA
  `Game.Mod` requirement — where relying on `editionSlug` alone silently
  defaulted every join to the wrong mod — is the cautionary example; read the
  comments in `src/lib/multiplayer/openRaMod.ts` before wiring a new
  multi-variant engine the same way.
- Confirm `hostModesFor` offers the right choices (self-hosted, PlayBound
  dedicated, or both) and that a real party for this game reaches ready →
  launching → connected. Test both host modes where the game supports both —
  don't assume the one you tried first covers the other's code path.

## 4. Controller support — wire into the controller system

- If the game supports a gamepad, tag the **Controller Support** feature in
  Taxonomy. This alone drives the phone-controller offer at Play time
  (`gameSupportsController` in `launcher/renderer/phoneController.js` reads
  `features`/`tags` for exactly this).
- If PlayBound has a curated per-game button-mapping profile system for this
  engine (`launcher/services/gameControllerConfig.js`), add an entry so
  phone-as-controller actually remaps buttons instead of only bridging a
  generic gamepad signal.

## 5. Total conversion mods — check for editions

- Search for standalone total-conversion forks: a different binary/client
  built on the same engine, not a content pack for the original. These
  belong in the Editions system (`installMethod: playbound_installer`), not
  the Mods list. Combined Arms and Tiberian Dawn HD on OpenRA are the
  reference pattern — separate editions of the same base game, each with
  their own install recipe.

## 6. High-quality mods — add to the mods list, and consider an edition

- Search for well-regarded, actively-maintained mods for the game and add
  the good ones via the Mods tab so they're actually findable.
- If a mod is dramatically better than vanilla — an HD remaster, a
  QoL/balance overhaul the community broadly recommends over the base game —
  package it as its own Edition instead of leaving it buried as a mod entry
  nobody browsing the game page will find.

## 7. Field Correlation Reference & Schema Directory

Every field in the Admin Game Form (`/admin/games/[slug]/edit`), the TypeScript schema (`GamePayload` in `src/lib/gamePayload.ts`), and the database model (`CatalogGame` in `src/lib/models/CatalogGame.ts`) serves a distinct purpose. **Never leave fields with scraped placeholder values, duplicates, or guesses.**

| UI Section | UI Field Label | Schema / Code Field | Type & Constraints | Strict Rules & Requirements |
| :--- | :--- | :--- | :--- | :--- |
| **Basics** | Title | `title` | `string` (min 1, max 100) | Canonical game title. |
| **Basics** | Slug | `slug` | `string` (kebab-case, unique) | URL identifier. Renaming updates cascades automatically. |
| **Basics** | Tagline | `tagline` | `string` (min 1, max 200) | **Must NEVER equal Description.** A punchy hook or promise (e.g. *"A community-driven Pokemon MMO with rich real-time battles."*). Scraped drafts often duplicate description here; you must rewrite it! |
| **Basics** | Description | `description` | `string` (min 1, max 1000) | Summary for game cards, search snippets, and meta descriptions (1–2 paragraphs). Distinct from Tagline and distinct from Long Description. |
| **Basics** | Developer | `developerSlug`, `developerName` | `string` | Developer organization or author slug. Pick existing or create new. |
| **Basics** | License | `license` | `string` | e.g. "Freeware", "GPL-3.0", "MIT", "Proprietary / Free to Play". |
| **Basics** | Release year | `releaseYear` | `number` (1970–present) | Year the game was originally or publicly released. |
| **Basics** | Size (MB) | `sizeMB` | `number` (integer MB > 0) | **Mandatory.** Actual disk footprint / archive size in MB. Inspect upstream package or extracted folder. **Never leave 0 MB or empty.** |
| **Basics** | Website | `website` | `string` (url) | Official project or download website. |
| **Basics** | Steam App ID | `steamAppId` | `string \| null` | Numeric Steam App ID if available. |
| **Basics** | GitHub Repo | `githubRepo` | `string \| null` | `owner/repo` string if open-source. |
| **Access & pricing** | Access Tier | `access.priceType` | `"free" \| "pwyw" \| "freemium" \| "paid"` | Pricing classification. |
| **Cover & media** | Cover Image | `coverImage` | `string` (URL) | Vertical box-art or hero image. |
| **Cover & media** | Screenshots | `screenshots` | `string[]` (max 20) | In-game action screenshots. |
| **Cover & media** | Videos | `videos` | `string[]` (max 10) | YouTube, Vimeo, or direct MP4/WebM video URLs. |
| **Editorial** | Quality Bar Verdict | `qualityBar.verdict` | `string` (present tense) | How the game feels to play. Punchy and concrete. |
| **Editorial** | Tested by PlayBound | `qualityBar.playboundTested` | `boolean` | Check ONLY after verified hands-on testing. |
| **Editorial** | Verification Date | `qualityBar.testedOn` | `string` (YYYY-MM-DD) | Date verified hands-on. |
| **Editorial** | That One Thing | `thatOneThing` | `string` (min 4 words) | The memorable single hook you would excitedly tell a friend. |
| **Editorial** | Long Description | `longDescription` | `string` (min 150 words, target 400–600) | In-depth original editorial prose detailing mechanics, feel, and context. |
| **Editorial** | Why We Picked It | `whyWePickedIt` | `string` (min 20 words, ~100 words) | Mission-framed explanation of why PlayBound curates this game. |
| **Editorial** | Best For | `bestFor` | `string[]` (≥2 items) | Specific player profiles or situations (e.g. "LAN parties", "Pokemon fans wanting MMO mechanics"). |
| **Editorial** | Not For | `notFor` | `string[]` (≥2 items) | Honest caveats or limitations (e.g. "Players wanting single-player story without grinding"). |
| **Editorial** | Comparable To | `comparableTo` | `string[]` | Paid / commercial games this resembles (for discovery/alternatives). |
| **Taxonomy** | Launch Methods | `launchMethods` | `("browser" \| "install" \| "server")[]` | **Desktop install games must have `"install"`.** Only use `"browser"` for genuine WebGL/HTML5 games playable in a web browser tab. If a game has a native downloadable client, it is `"install"`. |
| **Taxonomy** | Browser Playable | `browserPlayable` | `boolean` | **Must be `false` for downloadable desktop games.** Scraped website imports mistakenly default this to `true`. Always uncheck if the game runs locally on PC! |
| **Taxonomy** | Platforms | `platforms` | `("Windows" \| "macOS" \| "Linux" \| "Android" \| "iOS" \| "Web")[]` | Real supported operating systems. **Never select `"Web"` for a native PC executable/installer.** Select `"Windows"`, `"Linux"`, and/or `"macOS"` based on actual binaries provided. |
| **Taxonomy** | Genres | `genres` | `Genre[]` (from closed `GENRES` list) | Primary gameplay genres (e.g. `"MMO"`, `"RPG"`, `"Action"`). |
| **Taxonomy** | Features | `features` | `string[]` (from closed `FEATURES` list) | Must match closed `FEATURES` array in `src/lib/gamePayload.ts` (e.g. `"Multiplayer"`, `"Co-op"`, `"Controller Support"`, `"Cross-play"`, `"LAN Support"`, `"Dedicated Servers"`). |
| **Taxonomy** | Max Players | `maxPlayers` | `number \| null` | Lobby or concurrent player limit when Multiplayer is selected. |
| **Taxonomy** | Tags | `tags` | `string[]` | Normalized tags (e.g. `"Creature Collector"`, `"Indie"`, `"Open World"`). |
| **Taxonomy** | Search Aliases | `aliases` | `string[]` | Alternative names, acronyms, or common abbreviations (one per line). |
| **Install** | Launcher Install | `launcherInstall` | `LauncherInstall` object | Direct one-click recipe for the launcher (`direct-zip`, `github-zip`, `direct-installer`, etc.). |
| **System & servers**| System Requirements| `systemRequirements` | `{ min: string, recommended: string }` | Minimum and recommended hardware specifications. |
