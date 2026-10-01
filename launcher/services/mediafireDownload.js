"use strict";

/** Resolve only MediaFire's own download button, never a page ad or redirect. */
function mediafireArchiveHref(html) {
  const anchor = String(html).match(/<a\b[^>]*\bid=["']downloadButton["'][^>]*>/i)?.[0];
  const href = anchor?.match(/\bhref=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&");
  if (!href) throw new Error("MediaFire did not provide a download button");
  const url = new URL(href);
  if (url.protocol !== "https:" || !/^download\d+\.mediafire\.com$/i.test(url.hostname) ||
      !/\.7z$/i.test(url.pathname)) {
    throw new Error("MediaFire returned an unexpected archive URL");
  }
  return url.toString();
}

async function resolveMediafireArchive(pageUrl, fetchImpl = fetch) {
  const page = new URL(pageUrl);
  if (page.protocol !== "https:" || page.hostname !== "www.mediafire.com" ||
      !/^\/file\/[A-Za-z0-9]+\//.test(page.pathname)) {
    throw new Error("Invalid MediaFire source page");
  }
  const response = await fetchImpl(pageUrl, { headers: { "user-agent": "Mozilla/5.0 PlayBound" } });
  if (!response.ok) throw new Error(`MediaFire source returned ${response.status}`);
  return mediafireArchiveHref(await response.text());
}

module.exports = { mediafireArchiveHref, resolveMediafireArchive };
