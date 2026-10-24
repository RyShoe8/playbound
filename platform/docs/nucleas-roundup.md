# Nucleas manual roundup integration

Configure server-only `NUCLEAS_ROUNDUP_SECRET` with the same high-entropy secret in PlayBound and the Nucleas caller. Never prefix it with NEXT_PUBLIC_. Missing configuration returns 503. Use HTTPS and send no browser session cookies. Canonical URLs use the existing SITE_URL (`NEXT_PUBLIC_SITE_URL`, production https://playbound.club).

Endpoint: `/api/integrations/nucleas/roundup` (Node runtime). All responses have Cache-Control: no-store.

Authentication on both methods:
- `x-nucleas-timestamp`: Unix seconds, within 300 seconds of the server (past or future).
- `x-nucleas-signature`: hex SHA256 HMAC with NUCLEAS_ROUNDUP_SECRET over `${timestamp}.${method}.${pathname+search}.${rawBody}`.
- Sign the exact encoded query string in transmitted order and exact UTF-8 body, including whitespace. GET rawBody is empty. Method is uppercase. No origin in signed message. Invalid/missing authentication returns 401. Compare signatures with timingSafeEqual.

GET `?since=<ISO datetime with timezone>&until=<ISO datetime with timezone>` uses a half-open interval [since, until), since < until. Encode timezone plus signs. Returns 200:

```ts
type Post = {
  id: string; slug: string; url: string;
  title: string; summary: string; bodyMarkdown: string;
  publishedAt: string | null; sourceKey: string | null;
  coverageStart: string | null; coverageEnd: string | null; coveredIds: string[];
};
type Game = {
  id: string; // Mongo catalog _id, use this in coveredIds
  slug: string; url: string; title: string; tagline: string;
  description: string; longDescription: string | null;
  genres: string[]; features: string[]; platforms: string[];
  maxPlayers: number | null; browserPlayable: boolean;
  access: object | null; // stored CatalogGame.access acquisition facts, see below
  publishedAt: string; publicationDateBasis: "publishedAt";
};
type GetResponse = {
  since: string | null; until: string; games: Game[];
  previousRoundup: Post | null; limitations: string[];
};
```

Reads authoritative Mongo catalog rows only, with the public catalog visibility filter. Returns stored descriptions and gameplay facts without generated claims or seed overlays. `access` exposes stored priceType (FREE/PAID/PAID_BASE_GAME_REQUIRED), cents fields, currency, purchase/base-game requirements, dependency slugs, external game name, and retail offers. These are stored acquisition facts, not dependency-resolved total prices. Null/missing price fields must not be invented; absent access follows the existing legacy free catalog convention.

**Publication limitation:** CatalogGame has no firstPublishedAt. Its publishedAt is the latest move to published and can change on republishing. Undated legacy games are excluded and createdAt is never treated as publication. Therefore this API cannot guarantee first-publication-only detection; callers should surface the limitation and use previous coveredIds to avoid repeated coverage. GET never repairs dates or writes game records. No catalog schema or publication workflow is changed by this integration.

previousRoundup is the most recently published integration roundup or the initial manual anchor `new-games-platform-updates`, ordered by publishedAt descending (not restricted to the requested catalog window); future posts and drafts are excluded. Legacy anchor coverage fields return null/[] if absent. No anchor is created automatically.

POST accepts exactly:

```ts
type RoundupPublicationInput = {
  idempotencyKey: string; // 1..200 characters, A-Z a-z 0-9 . _ : -
  title: string; // trimmed, 1..160
  summary: string; // trimmed, 1..400
  bodyMarkdown: string; // trimmed, 1..100000
  coverageStart: string; // ISO datetime with timezone
  coverageEnd: string; // ISO datetime with timezone, strictly after start
  coveredIds: string[]; // up to 2000 Mongo catalog ObjectId strings
};
type PostResponse = { published: true; idempotencyKey: string; url: string; created: boolean; post: Post };
```

201 publishes immediately with PlayBound Team as author; 200 returns the existing post on a matching retry. Dates normalize to UTC and coveredIds normalize to sorted, unique lowercase IDs before hashing; other normalized input must match. Same key with different content returns 409. IDs are publication coverage metadata supplied by the caller; this route does not verify their membership in the date window. BlogPost stores sourceKey (`nucleas:roundup:<key>`), sourcePayloadHash, coveredIds, coverageStart and coverageEnd. The slug is `<normalized-title-up-to-100-characters>-<coverageEnd-UTC-YYYY-MM-DD>-<first-12-hex-of-sha256-key>`, with roundup as the fallback title. SourceKey and payload hash enforce idempotency; retries return the stored slug, including older slug formats. Keep the same key on network/500 retries and refresh the auth timestamp/signature. Requests can replay inside the auth window; publication deduplication persists beyond it.

POST establishes the unique partial sourceKey index before insertion and fails closed if that fails. Concurrent duplicate inserts re-read the winner and compare hashes. Cache invalidation also runs on retry to recover failures after insertion. Do not remove the sourceKey index. Publication retries never overwrite content. If an administrator later unpublishes the existing post, retries return 409 without republishing it.

400: invalid JSON/input/range; 401: invalid authentication; 409: key content conflict; 422: more than 2000 games in the requested/default window (narrow the explicit date range); 500: database/publication/cache failure; 503: missing secret. Errors return `{error:string}`. No deployment, migration, or live DB operation is required during local implementation; the index is established only by actual authorized publication requests (or normal model initialization).

Verification: `npx vitest run src/app/api/integrations/nucleas/roundup/route.test.ts` (DB and cache mocked; no live DB).

## Nucleas wire compatibility
GET additionally returns `baseline` and `lastRoundup`, both the same nullable object:
`{slug:string,url:string,publishedAt:string|null,coverageEnd:string|null,coveredIds:string[]}`.
Here `publishedAt` is the **coverage boundary** (`coverageEnd` when recorded, otherwise actual publication time for the manual anchor). `previousRoundup.publishedAt` remains the actual publication timestamp. This prevents delayed publication from skipping games between coverageEnd and publish time. Games additionally expose `priceType:string` from access.priceType, defaulting to FREE under the existing catalog convention.

POST additionally returns top-level `url:string`, identical to post.url. UUID idempotency keys are accepted. Nucleas may impose a 40000-character body cap; the server accepts up to 100000. These additions are backward compatible with the fuller types above.

## Discovery and verified publication receipt
GET accepts either **both** `since` and `until`, or **neither**. One missing date, empty values, invalid ISO values, or since >= until returns 400. Without dates, the endpoint first reads the latest published roundup/manual anchor and uses its coverageEnd (otherwise publishedAt) as since, with the request's server time as until. If there is no dated baseline, returns 200 with since:null, games:[], baseline:null (when no post), and lastRoundup:null (when no post); no unbounded catalog query is issued. A boundary at/after now returns no games. Explicit date queries still work without a baseline. GetResponse.since is therefore string|null. Authentication remains required for discovery, signing the path with an empty search string.

POST success receipt is exactly `{published:true,idempotencyKey:string,url:string,created:boolean,post:Post}`. The key echoes the validated input. Matching retries return the same receipt with created:false. If an administrator has unpublished the matching post, retry returns 409 instead of asserting publication or republishing it.



GET reads at most 2001 catalog rows. If there are more than 2000 matches it returns 422 with `{error:"Range contains more than 2000 games; request a narrower date range"}` instead of truncating or returning partial coverage. This applies to explicit and default windows.

POST invalidates the `blog` cache tag immediately and explicitly revalidates `/blog`, `/blog/<stored-slug>` and `/sitemap.xml` on creation and matching retries. Public blog list reads already tag their cached results with `blog` (`src/lib/blog.ts`).
