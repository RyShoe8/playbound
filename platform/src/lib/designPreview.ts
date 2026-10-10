/** /new shares real pages, permissions and metadata; it never aliases APIs. */
export function previewPagePath(path: string): string | null {
  if (path !== "/new" && !path.startsWith("/new/")) return null;
  const target = path.slice(4) || "/";
  if (/^\/(?:api|_next|new)(?:\/|$)/.test(target) || target.includes(".") || target.includes("\\")) return null;
  return target;
}

export function previewHref(href: string, origin: string): string | null {
  if (href.startsWith("#")) return null;
  const url = new URL(href, origin);
  if (url.origin !== origin || !/^https?:$/.test(url.protocol)) return null;
  if (/^\/(?:api|_next|new)(?:\/|$)/.test(url.pathname) || url.pathname.includes(".")) return null;
  // Authentication must retain its established callbacks and redirect behavior.
  if (/^\/(?:login|signup|register|forgot-password|reset-password|verify-email|welcome|logout)(?:\/|$)/.test(url.pathname)) {
    const callback = url.searchParams.get("callbackUrl");
    if (!callback || /^\/(?:login|signup|register|forgot-password|reset-password|verify-email|welcome|logout)(?:\/|\?|$)/.test(callback)) return null;
    const target = new URL(callback, origin);
    if (target.origin !== origin || !/^https?:$/.test(target.protocol)) return null;
    const next = previewPagePath(target.pathname) === null ? previewHref(target.href, origin) : null;
    if (!next) return null;
    url.searchParams.set("callbackUrl", next);
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return `/new${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`;
}

/** Keep programmatic navigation in the same design, including filter-button clicks. */
export function pageHref(href: string): string {
  if (typeof window === "undefined" || previewPagePath(window.location.pathname) === null) return href;
  return previewHref(href, window.location.origin) ?? href;
}
