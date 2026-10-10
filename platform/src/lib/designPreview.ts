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
  if (/^\/(?:login|register|welcome|logout)(?:\/|$)/.test(url.pathname)) return null;
  return `/new${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`;
}
