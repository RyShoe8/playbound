/**
 * Catalog visibility: draft / watchlist (CMS only), testing / ready (admins), published (everyone).
 * Boolean `published` remains synced as status === "published" for legacy filters.
 */

export const CATALOG_STATUSES = ["draft", "watchlist", "testing", "ready", "published"] as const;
/** Mods do not have a release-ready state; it is a game editorial milestone. */
export const MOD_STATUSES = ["draft", "watchlist", "testing", "published"] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];
export type ModStatus = (typeof MOD_STATUSES)[number];

export function isTestingGameStatus(status: unknown): boolean {
  return status === "testing" || status === "ready";
}

function isCatalogStatus(value: unknown): value is CatalogStatus {
  return typeof value === "string" && (CATALOG_STATUSES as readonly string[]).includes(value);
}

/** Prefer `status`; fall back from legacy `published` boolean. */
export function normalizeStatus(doc: {
  status?: unknown;
  published?: unknown;
}): CatalogStatus {
  if (isCatalogStatus(doc.status)) return doc.status;
  return doc.published ? "published" : "draft";
}

export function normalizeModStatus(doc: { status?: unknown; published?: unknown }): ModStatus {
  return typeof doc.status === "string" && (MOD_STATUSES as readonly string[]).includes(doc.status)
    ? doc.status as ModStatus
    : doc.published ? "published" : "draft";
}

export function statusToPublished(status: CatalogStatus): boolean {
  return status === "published";
}

/**
 * Mongo filter for public vs admin (published + testing + ready) surfaces.
 * Includes legacy docs that only have `published: true` and no `status`.
 */
export function mongoVisibleFilter(opts?: { includeTesting?: boolean }): Record<string, unknown> {
  const statuses: CatalogStatus[] = opts?.includeTesting
    ? ["published", "testing", "ready"]
    : ["published"];

  return {
    $or: [
      { status: { $in: statuses } },
      // Legacy: no status field — treat published:true as published only
      ...(opts?.includeTesting
        ? [
            { status: { $exists: false }, published: true },
            // Legacy drafts weren't visible; no path to invent "testing" from boolean alone
          ]
        : [{ status: { $exists: false }, published: true }]),
    ],
  };
}

/** Ensure API/form payloads always write status + synced published flag. */
export function withSyncedPublished<T extends { status?: CatalogStatus; published?: boolean }>(
  body: T
): T & { status: CatalogStatus; published: boolean } {
  const status = isCatalogStatus(body.status)
    ? body.status
    : body.published
      ? "published"
      : "draft";
  return { ...body, status, published: statusToPublished(status) };
}
