/**
 * A real modification date, or no date at all.
 *
 * `lastmod` is only a signal while it is true. Every route below used to fall
 * back to the time the sitemap was generated, which put a fresh timestamp on
 * 641 of 846 URLs and reset all of them on each deploy — telling Google three
 * quarters of the site changes whenever anything does. Google discounts a
 * `lastmod` it can tell is inaccurate, so the pages that genuinely did change
 * lost the signal along with the ones that did not.
 *
 * Omitting the element is the documented way to say "no reliable date", and it
 * costs nothing: a URL without `lastmod` is crawled on its own merits rather
 * than on a claim Google has learned to ignore.
 */
export function lastMod(value?: string | Date | null): { lastModified?: Date } {
  if (!value) return {};
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? {} : { lastModified: d };
}

/** The most recent updatedAt in a set, for pages that list other things. */
export function newestUpdate(items: { updatedAt?: string | Date | null }[]): Date | null {
  let newest: number | null = null;
  for (const item of items) {
    if (!item.updatedAt) continue;
    const t = new Date(item.updatedAt).getTime();
    if (Number.isNaN(t)) continue;
    if (newest === null || t > newest) newest = t;
  }
  return newest === null ? null : new Date(newest);
}
