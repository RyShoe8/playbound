# Adtraction sales reporting

`/admin/ecommerce` reads locally stored Adtraction sale transactions alongside
the existing outbound purchase-link click counts. Viewing the page never calls
Adtraction. There is no public reporting endpoint and no API token field in the
browser.

## Enable

1. Obtain a **partner** API token through Adtraction's Account → Settings → API.
   If that control is missing, ask Adtraction to enable it.
2. Add `ADTRACTION_API_TOKEN` as a server-only Production environment variable in
   Vercel, then redeploy. Do not use a `NEXT_PUBLIC_` variable or commit the token.
3. The existing GOG store configuration contains an Adtraction tracking template.
   Channel IDs are read from the `as` parameter of enabled stores' HTTPS
   `track.adtraction.com/t/t` templates. No additional channel variable is needed.
4. Wait for the hourly cron (minute 25, UTC) or use **Sync now** on eCommerce.
   Before configuration, the cron returns `disabled` without connecting to Mongo
   or making an upstream request. The panel shows **Awaiting API token**, not zero sales.

Optional: set `ADTRACTION_REPORT_FROM=YYYY-MM-DD` before the first sync to specify
the beginning of history. Otherwise the first run chooses one year before that
run and persists that date. Setting an earlier date later extends the backfill;
setting a later date does not delete imported history. The panel shows its
reporting start and indicates incomplete history.

## What the numbers mean

- **Approved sales**: type `3` (Sale), status `1` (approved).
- **Pending sales**: type `3`, status `2` (pending).
- **Rejected sales**: type `3`, status `5` (rejected); excluded from approved and
  pending counts/commissions. Open claims and lead transactions are not sales.
- **Purchase-link clicks**: PlayBound's existing `purchase_clicked` telemetry,
  excluding detected bots. These are separate from sales and retained across all time.
- Commission totals are grouped by currency, never added across currencies.
  They are transaction commissions, **not** settled payouts or an account balance:
  adjustments, fees and payments are outside this integration.

The partner API does not provide purchased game line items or publisher-visible
order IDs. A sale referred by a Morrowind link may contain another game or a cart
of several games. Each unique provider transaction is counted once; the card
does **not** claim it sold that many copies of Morrowind.

## Attribution

The shared store-link builder adds `pb-game:<canonical-slug>` to an available EPI
field on Adtraction links (preferring `epi5`). This reaches website game CTAs,
launcher commerce payloads, and Deals that already have a catalog match.
Destination URLs, partner/channel IDs and existing non-PlayBound EPI fields are
preserved. Other affiliate networks and disabled affiliate links are unchanged.
No personal identifiers or API secrets go in those links.

Reports only associate exact PlayBound references with cards. They never guess
from transaction names, product categories or approximate titles. Old or unmatched
sales remain in the account totals and **Without a game-card match** count. These
are reporting records; this does not recreate the removed giveaway-matching list.

## Synchronization and failure handling

- The only upstream call is read-only reporting via
  `POST https://api.adtraction.net/v2/partner/transactions/`, authenticated with
  `X-Token`. `transactionStatus: 0` requests all statuses, scoped to each configured
  channel. Dates use explicit UTC ISO timestamps.
- Every run refreshes the last seven days. A resumable scan reads history in
  31-day intervals; after a complete scan, it runs again daily to pick up older
  approvals, rejections and commission changes.
- One Mongo lease, a five-minute manual cooldown, at most six requests per run,
  and a 42-second request budget bound the job. Requests have a 15-second timeout.
  A failed window does not advance its history cursor. Replays upsert by the
  provider's globally unique transaction ID, using Mongo's built-in `_id` index.
- A complete validated window can mark missing records inactive without deleting
  their audit record. Malformed, wrong-channel, wrong-date or incomplete responses
  cannot do that. The documented transactions response is an unpaginated array;
  unexpected pagination metadata fails closed instead of silently undercounting.
  An eight-MiB body limit prevents unbounded parsing; oversized reports report an
  actionable error and retain the previous data.
- The exact documented `No transactions found.` response is treated as no results.
  Authentication, rate-limit, network and other errors are **not** empty reports.
  HTTP 429 honors Retry-After with bounded backoff; rejected tokens back off an hour.
- Errors shown or saved are controlled messages, never raw upstream bodies or
  credentials. Partial imports, stale refresh dates and errors remain visible.
- `AffiliateTransaction` and `AffiliateSyncState` are independent collections.
  The sync does not modify games, offers, users, subscriptions, or Adtraction records.
  Their declared indexes are picked up by the existing index-maintenance cron.

The manual endpoint requires full admin access:
`POST /api/admin/ecommerce/adtraction/sync`. The scheduled endpoint requires the
existing `CRON_SECRET`: `GET /api/cron/adtraction`.

## Verification

The integration tests use a disposable local MongoDB and mocked provider
responses: no production database, token or upstream account is used. Coverage
includes status changes, currency separation, resumption, concurrency, duplicate
prevention, disabled setup, error redaction, authorization and link attribution.

After the real token is added, verify the first live response against the
Adtraction transaction report and confirm a new game referral returns the EPI
value. Live API access and attribution through a real purchase cannot be verified
without that token and a provider-reported transaction.

Sources: [Adtraction API documentation](https://apidocs.adtraction.net/nextgen/),
[API token setup](https://help.adtraction.com/en/articles/1563159-get-started-with-the-adtraction-api).
