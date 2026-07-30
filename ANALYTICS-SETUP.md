# Analytics — Setup

Google Analytics 4 and Ahrefs Web Analytics are wired into the root layout via `src/components/Analytics.tsx`. `tsc` and `eslint` pass. No new dependencies.

- **GA4 measurement ID:** `G-K41GXFDWJ2`
- **Ahrefs key:** `9LCmsoftYLxkK0xA5d92ow`

Both IDs are public by nature — they ship in client-side script tags — so they live as constants rather than env vars. Move them to `NEXT_PUBLIC_*` if you ever want separate properties per environment.

---

## One thing you must change in GA4

Without this, **every client-side navigation is counted twice**.

```
GA4 Admin → Data Streams → (your stream) → Enhanced Measurement (cog icon)
  → Page views → Show advanced settings
  → UNCHECK "Page changes based on browser history events"
```

**Why.** The tag you gave me is the standard snippet, which works fine on a traditional multi-page site. PlayBound is a Next.js App Router app: navigation is soft, the browser never reloads, and GA4 would otherwise record one pageview for an entire session. So the code sends `page_view` events manually on route change.

`send_page_view: false` in the config only suppresses the *initial* pageview from the config command. Enhanced Measurement's history listener is a separate mechanism configured in the GA4 UI, and it keeps firing on soft navigation alongside the manual events. There is no way to disable it from code — it has to be the checkbox.

Verify after deploying: open GA4 Realtime, click through three or four pages, and confirm you see three or four pageviews rather than six or eight.

---

## What the implementation does beyond pasting the tags

**Production only.** Both scripts are gated on `IS_PRODUCTION`, decided server-side in the layout and passed down as a prop. This matters more than it looks: `VERCEL_ENV` is not exposed to the browser, so a client-side `NODE_ENV` check would report `"production"` on preview deployments too and every preview would pollute the property.

**Admin traffic excluded.** `/admin/*` and `/launcher/auth` don't load the scripts and don't send pageviews. Your own catalog-editing sessions would otherwise show up as engaged users with high pageview counts, which quietly distorts every behavioural metric you'd want to act on.

**`afterInteractive` loading.** Analytics shouldn't compete with content for main-thread time during hydration. This is `next/script`'s default for good reason.

**Suspense boundary around `useSearchParams`.** Without one, that hook opts the entire route tree out of static rendering — it would have turned every static page dynamic and quietly undone a chunk of the SEO work.

---

## Ahrefs

Loads as given, with `data-key` intact. Nothing further to configure.

Worth knowing: it's a cookieless, privacy-focused counter, so its numbers will not match GA4 and are not supposed to. It's also a useful cross-check — if the two diverge sharply, that usually means ad blockers are eating GA4 traffic, which is common in a gaming audience.

---

## Two follow-ups

**Cookie consent.** GA4 sets cookies and sends data to Google. Under GDPR/ePrivacy that needs consent from EU visitors *before* the tag fires, and a free-games site will get EU traffic. Nothing here implements a consent gate. If that matters to you, the clean approach is Google Consent Mode v2 with `analytics_storage` defaulted to `denied` — tell me and I'll wire it. Ahrefs Analytics is cookieless and generally doesn't need consent.

**Privacy policy.** It should now mention Google Analytics, Ahrefs Analytics, and reCAPTCHA, and that data goes to Google. Currently it mentions none of them.

---

## Sources

- [Measure single-page applications — Google Analytics](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
- [Measure pageviews — Google Analytics](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Duplicate Events in Google Analytics 4 and How to Fix Them — Analytics Mania](https://www.analyticsmania.com/post/duplicate-events-in-google-analytics-4-and-how-to-fix-them/)
