# New game checklist

A catalog row with a title, a working install, and nothing else is not a
finished addition. Work through every item below for each game before
considering it done — this list exists because these steps have been skipped
before, not because they're hypothetical risks.

Do this per game, not per batch. A session that adds three games and defers
editorial/multiplayer/mods "for later" has added three unfinished rows, not
three games.

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
