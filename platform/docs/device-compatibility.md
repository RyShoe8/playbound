# Device compatibility filter

PlayBound can prioritize games that work on the visitor’s current device while always offering one-click access to the full catalog.

## How it works

1. **Device** — `useDevice()` classifies the client as `desktop` | `tablet` | `mobile`.
   - SSR seed: User-Agent via `parseUserAgent` + `deviceTypeFromUaDevice`.
   - After hydrate: viewport breakpoints (`<768` mobile, `<1024` tablet, else desktop) win.
2. **Preference** — `compatible` (default) or `all`, from `useCompatibilityFilter()`.
3. **Filter** — listing UIs call `isGameCompatible` / `filterGamesForPreference` / `prioritizeCompatible` from [`src/lib/compatibility/compatibility.ts`](../src/lib/compatibility/compatibility.ts).

Filtering is **client-only**. Server pages still load the full published catalog so crawlers and HTML always see every game. URLs never change.

## Compatible platform sets

| Device | Compatible when the game has… |
|--------|-------------------------------|
| desktop | `Windows`, `macOS`, `Linux`, or `Web`/`Browser`; or `browserPlayable`; or `steamDeck` |
| mobile / tablet | `Web`/`Browser`, `Android`, or `iOS`; or `browserPlayable` |

Catalog strings are Title-case (`Windows`, `macOS`, …, `Web`). UI badges label `Web` as **Browser**.

## Preference storage

| Visitor | Where |
|---------|--------|
| Guest | `localStorage` key `pb-compatibility-filter`; mirrored cookie `pb-compat-filter` (UI seed only) |
| Signed in | `User.preferences.compatibilityFilter` via `GET`/`PATCH` `/api/auth/preferences` |

On login: profile value wins when set; otherwise the local value is pushed to the profile once.

## UI

- Global toggle: left sidebar (`lg+`) and TopBar select (`<lg`).
- Listing bar + message: homepage (under hero via `HomeGamesSections`), Discover, Search, collections, developer games.
- Cards always show platform badges; in **All Games** mode incompatible cards get a **Mobile Only** or **PC Game** badge.
- Game detail: informational banner + **Save to Library** (no launcher handoff) when incompatible.

## Adding a platform

1. Add the display string to `PLATFORMS` in [`src/lib/gamePayload.ts`](../src/lib/gamePayload.ts).
2. Extend `PLATFORMS_FOR_DEVICE` / `PLATFORM_BADGE_ORDER` in `compatibility.ts`.
3. Map an icon in [`GamePlatformBadges`](../src/components/GamePlatformBadges.tsx).
4. Seed/import games with the new platform string.

## Recommendations

`prioritizeCompatible(games, device, { ratio: 0.9, limit })` fills ~90% compatible slots then popular/other titles. Used by **More Like This** (`soft` mode — does not hard-exclude). Featured grids hard-filter when preference is `compatible`.

## Key files

| Path | Role |
|------|------|
| `src/lib/compatibility/compatibility.ts` | Pure rules |
| `src/hooks/useDevice.ts` | Device hook |
| `src/hooks/useCompatibilityFilter.ts` | Preference + provider |
| `src/components/GameCompatibilityToggle.tsx` | Sidebar + mobile topbar toggle |
| `src/app/api/auth/preferences/route.ts` | Persisted prefs |
