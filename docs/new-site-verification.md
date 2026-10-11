# New-site verification — October 10, 2026

This is a coverage record, not a claim that every production action has been exercised.

## Fixed

- Hidden original headers and preview headers no longer remain mounted together after hydration. This removes duplicate notification polling from the inactive shell.
- Search filter buttons preserve `/new` during programmatic navigation.
- Same-origin login callbacks preserve the preview destination; authentication routes stay on their existing URLs.
- Anonymous Start Party returns to the preview party flow after login.
- Events streams its live-party section separately so that section does not block the schedule.
- Party and matchmaking close controls have accessible labels.
- Servers With Players applies to community listings as well as individual games. Unknown counts are not treated as occupied.
- Analytics integration fixtures use the actual current instant for today's events, avoiding local-midnight/UTC disagreement.

## Browser checks completed

Signed in: search submit; RTS search filter; all primary navigation destinations; account menu; sign-out; Discover library exclusion (167 to 100 games, then restored); Deals Free plus GOG; party panel opening/closing; matchmaking panel opening without publishing availability.

Signed out: Library sign-in gate and preview callback; Start Party login callback; Discover genre filtering; disabled library-exclusion control with explanation; hidden Administration link; direct admin access redirects away. OpenRA media, editions, install, mods, guides, achievements, news, discussion, reviews and overview links reach their intended URLs.

Earlier visual checks: desktop and 390px mobile home, no horizontal document overflow; original footer and admin navigation structure retained. Original and preview OpenRA pages have the same canonical and four JSON-LD blocks; preview has noindex.

## Automated checks

251 test files / 1,755 tests passed. TypeScript passed. Changed-code lint has no errors; GlobalServerBrowser has two pre-existing warnings (an unused suppression and aria-sort on a button).

Anonymous read-only HTTP sweep: 17 key URLs returned successful responses with no application-error text. These responses alone do not verify interactions. One initial Events request took about seven seconds; no statistically reliable before/after latency claim is made.

## Not verified end to end

- Registration, email delivery, password reset, OAuth completion, and login with a second non-admin account.
- RSVP writes, event creation/cancellation, friend invitations, messages, reviews and other public submissions.
- Payments, subscriptions, downloads, launcher installation/Join, Discord app fallback, and server lifecycle operations.
- Every admin mutation, every game/edition, every filter combination, and every mobile page.

These require isolated accounts/fixtures or an explicitly scoped live transaction. No production events, parties, invites, purchases, or server changes were created by this audit. The test browser was signed out to verify anonymous behavior.
