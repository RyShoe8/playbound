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

For dedicated-server games/editions, additionally complete
[`dedicated-server-game-checklist.md`](../../docs/dedicated-server-game-checklist.md).
It covers hosting, queries, Join, controls, self-hosted party parity, updates,
save safety, capacity, and release verification for every offered server game.

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
- **Install steps are mandatory, even when the launcher recipe works.** Save
  concrete, ordered `installSteps` on the game: where to obtain a lawful copy,
  what PlayBound's Install or Locate action does, what executable is found,
  and any required post-install step. Cover **every supported OS** with an
  `all` step plus OS-specific steps where the process differs. Read the saved
  game back from the admin page and confirm the Install section is populated;
  source-file text alone does not prove the database has those steps. Never
  claim one-click support on an OS that only has a store/client handoff.
- **One-click is the default goal for every game that can support it.** Before
  settling for `external`, work through this ladder and record what you found:
  1. Official direct zip/7z/RAR/installer on the developer's own site →
     `direct-zip` / `direct-7z` / `direct-installer` (e.g. Hydorah's
     `locomalito.com/files/hydorah.zip`).
  2. A **ModDB file page** is valid as the recipe `url`: the launcher resolves
     the signed CDN link and verifies the page's MD5 at install time
     (`launcher/services/moddbDownload.js`). RAR is extracted through the 7-Zip
     path, so use `direct-7z` for `.rar` (Wings of Dawn) and `direct-zip` for
     `.zip` (Wreckage).
  3. GitHub release asset → `github-zip` / `github-installer` / `github-jar`.
  4. itch.io page with a free build → `itch-zip`.
  5. Free-to-play Steam title → `steamcmd` only if an anonymous SteamCMD
     download is proven to work (PlanetSide 2 is the reference). If it has not
     been tested, use `external` with `steam://run/<appid>` and say in the
     recipe `note` that it is a steamcmd candidate. Do not claim anonymous
     install without testing it.
  6. Paid game → **check GOG first**, then Steam, then the developer's store.
     A DRM-free GOG purchase is preferred because it gives an offline installer
     that never needs a client running. Record every store as an `access.offers`
     entry (GOG first when it exists) and use `external` pointing at the GOG
     page, with an install step that tells the player to press **Locate** after
     installing. If a game is not on GOG, say so in the install steps and FAQ
     ("we found no GOG listing").
  7. Legally unredistributable clients (Capcom's Dragon's Dogma Online client,
     the Nintendo-takedown AM2R v1.1 archive) get no one-click recipe and no
     instructions for obtaining the files. See "Legal red flags" below.
- **Verify the archive before wiring the recipe.** Do not guess the executable
  or whether the archive has a single root folder. Fetch the file listing with
  HTTP range requests (a small Python script using `zipfile` for zips, or the
  `rarfile` package for RARs, with a file-like object that issues
  `Range:` requests) and record the real exe path, root folder name,
  uncompressed size and any readme. Then set `knownExePaths`, `exeHint` and
  `unwrapSingleRoot` from what you saw, not from what is typical.
- **Accurate install size**: Determine and record the real download / installed disk footprint in `sizeMB`. Do not leave placeholder or guessed sizes. Inspect the upstream package archives and extracted folder sizes so the launcher and game cards accurately reflect disk requirements to players.
- **Multi-version & architecture wiring**: Ensure games are wired for all versions, architectures, and platforms they support (Windows 64-bit/32-bit, Linux, macOS). If distinct architectures or engine variations exist (such as legacy 32-bit Windows builds or community forks), create dedicated Editions (`src/lib/data/editions.ts`) or per-platform recipe URLs (`urlLinux`, `urlMac`, `urlMacX64`) so players on any supported configuration have a one-click install.
- **Hardware requirements are mandatory for every supported platform.** Copy
  the developer's minimum and recommended CPU, RAM, graphics/API, OS and free
  space into `systemRequirements`; populate `hardwareRequirements` with only
  the structured figures the source actually supports and record provenance.
  State when a recommendation is unpublished. Check the platform's actual
  current build before promising an install (an obsolete Mac requirement on a
  store page is not proof of a current Mac download). Do not confuse a
  storefront's free-space requirement with measured installed size.

### Hardware specification completion gate

Complete this for **each game and each edition with different requirements**
before marking it ready, including games already in **Testing**. These fields
remain required as a game moves from Draft to Testing to Published. The 8-item
editorial indicator does not check them, so a green editorial indicator alone
is insufficient.

1. Confirm the currently offered client builds and `platforms` against the
   developer's own download/store page. For **Windows, macOS and Linux
   separately**, transcribe the published minimum and recommended OS version,
   architecture, CPU, RAM, GPU, VRAM, graphics API, and free disk space into
   `systemRequirements.min` and `.recommended`. Include required runtimes or
   instruction-set limitations where the developer names them.
2. Populate `hardwareRequirements.min` and `.recommended` with the published
   structured values (`os`, `arch`, `cpuText`, `gpuText`, `ramMB`, `vramMB`,
   `storageMB`, `apis`) and fill `provenance.source`, `sourceUrl` and
   `verifiedAt`. The structured format has only one specification per tier:
   if platforms differ, use a conservative shared floor and spell out each
   platform's actual figures in the text. Never put a Windows-only DirectX
   requirement on a structured spec that also claims macOS or Linux support.
3. If the developer does not publish a recommended tier or a particular
   number (often GPU, VRAM or storage), write **"not published"** for that
   tier or field in the text, and leave its structured value unset. Do not
   invent a benchmark or silently copy the Windows numbers onto Mac/Linux.
   Distinguish older requirements still shown on a store page from confirmed
   support for a current client build.
4. Record the **actual package download/installed size** separately as
   `sizeMB`. The store's "space available" figure is a hardware requirement,
   not an install-size measurement. If the current package is larger than the
   published free-space minimum, state that discrepancy and allow enough room
   for the real package; do not present the outdated minimum as sufficient.
5. Save, reopen the **database-backed admin edit page**, and verify both
   requirement fields survived for every supported platform. Check the public
   game page and hardware-compatibility result for a supported OS (especially
   Mac/Linux when Windows DirectX is listed). Only then count the hardware
   specification as complete.

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
- **Originality is required throughout the editorial.** Write the verdict,
  That One Thing, tagline, description, long description, and Why we picked it
  specifically for this game. Do not copy or lightly rephrase a store page,
  review, wiki, another PlayBound entry, or an AI-generated stock line. Avoid
  interchangeable hooks such as "one more run," "anything can happen," or
  "a routine trip becomes an adventure." That One Thing should name one
  distinctive, verifiable gameplay mechanic or plausible in-game moment;
  make it vivid or funny when the game earns it, without inventing mechanics
  or presenting a fabricated play session as something we tested. Before
  saving, compare the copy with nearby game entries: if swapping game names
  still makes it work, rewrite it.
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
| **System & servers** | System Requirements | `systemRequirements` | `{ min: string, recommended: string }` | Break out minimum and recommended CPU, RAM, GPU/graphics API, OS, and free disk space for every supported platform; state when a tier is unpublished. |
| **System & servers** | Hardware Requirements | `hardwareRequirements` | Structured minimum/recommended CPU, GPU, RAM, VRAM, storage, graphics API and OS, with source URLs | Enter only developer-supported figures. Preserve platform-specific differences in the text breakdown; a Windows-only API or OS must not cause the compatibility checker to reject a supported Mac/Linux build. |

## 8. Working method — how a batch of games is actually entered

This is the procedure that produced the October 2026 batch (Double Dragon
Trilogy, KOF '97 Global Match, Sport Animals, Omega Strikers, Regular Human
Basketball, City of Heroes: Homecoming, PlanetSide 2, Hypersomnia, Wings of
Dawn, Wreckage, Hydorah, Boll Deluxe, Project Celeste, Dragon's Dogma Online).
Follow it so every game ends up with the same completeness.

### Reading and writing the catalog through the admin session

- Work in a browser that is **signed in as an admin** (`/api/auth/session`
  must return a user; unauthenticated calls return `403 Admin only`). The
  agent never types credentials; ask the user to sign in.
- **Read** a game from the database-backed edit page: fetch
  `/admin/games/<slug>/edit`, join the `self.__next_f.push` chunks, take the
  `"initial":{...}` object and resolve `"$NN"` references (long strings are
  sent as separate `NN:T<len>,` rows). `"$undefined"` means unset.
  `<len>` is hex and counts **UTF-8 bytes**, not characters: slice the
  encoded bytes, then decode. Slicing the JS string instead over-reads into the
  next row whenever the text has an em-dash or other multi-byte character, and
  a PATCH of that read appends the garbage to the live field.
- **Create** with `POST /api/admin/games` (full payload). A `409 Slug already
  exists` means a placeholder row is there already — read it, then `PATCH`.
- **Update** with `PATCH /api/admin/games/<slug>` using the *entire* payload
  (read, merge, strip `"$undefined"` strings and server-only fields such as
  `createdAt`, `updatedAt`, `adminUpdatedAt`, `publishedAt`, `externalIds`),
  or the save fails validation.
- **Media**: `POST /api/admin/games/media` with `{steamAppId, slug}` or
  `{url, slug}` is the "Refresh media" button. For Steam titles it returns a
  header cover, screenshots and HLS trailers (HLS plays on the site). For
  everything else prefer, in order: the developer's own gallery, the store
  page, then Wikipedia box art. Never use forum avatar thumbnails or
  `thumb_` / `crop_` variants as screenshots.
- **Controls**: `PATCH /api/admin/games/<slug>/controls` with `{controls}`.
  Bindings need a `sourceUrl` (a readme shipped in the download is a good
  source) or must be marked verified; otherwise write notes only.
- **Status**: `testing` and `ready` are admin-visible; only `published` is
  public. When the user asks for a game to be "ready", set `status: "ready"`
  and do not publish. Do not tick "tested by PlayBound" unless it was played.
- Read every game back afterwards and check: status, long-description word
  count (400+), why-we-picked-it, best-for/not-for (2+ each), FAQ (4+), install
  steps, verdict (40+ chars) and date, structured hardware, size, cover,
  screenshots, video, launcher recipe kind and developer.

### Research method

- Use the browser, not a fetch tool, for sites that return 403 to bots
  (ModDB, Hard Light, GOG pages sometimes). Never try to solve a Cloudflare
  challenge or CAPTCHA; if a site demands one, use another source (the
  developer's own site, a store page, a readme inside the download).
- Take facts from the developer's page, the store page and files shipped in the
  download (readme, license). Cross-check with a second source. Facts and
  numbers may be reused; sentences may not.
- **Prices**: record the regular price, not a temporary sale price, and set
  `lastCheckedAt`. Mention the sale in the FAQ only if it is long-running.
- **Sizes**: `sizeMB` is the real installed footprint when you can measure it
  (archive listing, store page). When you only know the installer/download
  size, use that, say which it is in the FAQ, and give the store's published
  free-space figure separately.
- **Developer**: credit who actually made the game (the ModDB creator, the
  studio on the store page), not a placeholder or the publisher unless they are
  the same. Use a slug and the display name; the admin API creates the
  developer if it does not exist.
- **Placeholders**: a row whose website is `example.com`, whose repo is
  `example/...` or whose developer does not exist (the "Cosmic Platformer"
  test row) is not a game to fill in. Flag it for deletion instead of
  inventing data.
- Platform and version support comes from the developer, not the store tag.
  macOS/Linux builds that exist only as community ports are described in the
  install steps as unofficial and are **not** added to `platforms`.

### Editorial reminders learned in practice

- A long description is **400–600 words** even though the validator only
  enforces 150. State the honest catches: language, age, abandoned status,
  quiet servers, content warnings, which tiers the developer did not publish.
- If the developer publishes no recommended tier, say "not published" in text
  and leave the structured field unset. Never copy Windows numbers to other
  platforms.
- Do not claim controller support the developer does not state. The store tag
  is not proof; a readme, config or store listing is.
- Multiplayer answers must match reality: local-only, store-matchmaking, or a
  community server. Only claim PlayBound Connect/dedicated hosting for games
  registered in `HOSTABLE_GAMES` / `MULTIPLAYER_ADAPTERS`. For local-only
  games, the screen-sharing couch party is the route for faraway friends.

### Legal red flags — stop and ask before marking ready

- **Nintendo/Sega/Capcom fan games under an active takedown** (AM2R: Nintendo
  DMCA'd the original build; the community launcher needs an archive that is
  not legally redistributable). Do not write instructions for obtaining the
  files and do not host them. Leave the entry on `watchlist` and ask.
- **Clients that are not redistributable** (Dragon's Dogma Online): list only
  what the community publishes, say plainly PlayBound distributes nothing, and
  do not offer a one-click recipe.
- Fan games without a rights-holder arrangement (Boll Deluxe) are listed with
  an explicit unlicensed-use caveat in the long description and FAQ.
- Any `watchlist` game with a broken official link (the AM2R community site
  returns "Site not found") needs its `website` replaced before it can be ready.

### Private-server editions (reference: SWG Infinity, LegacyDDON, Dogma Rising)

When a game survives only on fan servers, each server is an **Edition**
(`type: "private"`, `isStandalone: true`), created with `POST /api/editions`
and updated with `PATCH /api/editions/<id>` (full payload). The base game keeps
an `external` recipe and a long description that points at the editions; the
site synthesizes the "Official" edition itself, so never add one.

- If the server publishes its own launcher that downloads the client
  (LegacyDDON's `DDO_Launcher.exe`), wire it as `installMethod:
  "playbound_installer"` with `kind: "direct-exe"` or `"direct-installer"`.
  PlayBound fetches only the server's launcher; the launcher fetches the
  client. Say in the install steps that the player registers and downloads the
  client inside it.
- If the client is only available as a Google Drive/Mega archive
  (Dogma Rising), use `installMethod: "manual"` with concrete steps and tell the
  player to **Locate** the result. Do not link or script the archive, and say
  plainly in the FAQ why it is not one-click.
- Respect folder warnings from the server (LegacyDDON wants a non-user
  folder on `C:`); PlayBound's default games folder is under the user profile,
  so put the workaround in the steps and FAQ.
- Mark `verificationLevel: "untested"` until the install has been run end to
  end.
