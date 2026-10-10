"use strict";

/**
 * Resolve a Deadly Stream file page to a downloadable URL plus the session
 * cookie that authorises it.
 *
 * Deadly Stream (the KOTOR and TSL modding hub) lets anyone download without an
 * account, but the "Download this file" button is a one-time link carrying a
 * csrfKey that only works with the anonymous session cookie issued alongside the
 * page. Fetching the link without the cookie answers 403. So the catalog keeps
 * the permanent file-page URL, and the launcher takes the page, the link and the
 * cookie at install time and sends the cookie with the download.
 *
 * Only deadlystream.com is fetched and the cookie is only ever sent back to it.
 */

const USER_AGENT = "Mozilla/5.0 PlayBound";
const HOST = "deadlystream.com";

/** https://deadlystream.com/files/file/<id>-<slug>/ , optionally with ?r=<file id>. */
function isDeadlyStreamFilePage(rawUrl) {
  try {
    const u = new URL(String(rawUrl));
    return u.protocol === "https:" && u.hostname === HOST && /^\/files\/file\/\d+-[^/]+\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** The download link on a file page. With `fileId`, the one for that specific file. */
function parseDownloadLink(html, fileId) {
  const links = [...String(html).matchAll(/href=['"](https:\/\/deadlystream\.com\/files\/file\/\d+-[^'"]*do=download[^'"]*)['"]/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((u) => /csrfKey=[a-f0-9]+/.test(u));
  if (!links.length) return null;
  if (fileId) return links.find((u) => new RegExp(`[?&]r=${fileId}(&|$)`).test(u)) || null;
  // Without a chosen file, prefer the plain link over per-file ones.
  return links.find((u) => !/[?&]r=\d+/.test(u)) || links[0];
}

/**
 * Mods with several files open a chooser at ?do=download. Its links carry the
 * file id and a confirm flag; the one for `fileId` is the download.
 */
function parseChooserLink(html, fileId) {
  const links = [...String(html).matchAll(/href=['"](https:\/\/deadlystream\.com\/files\/file\/\d+-[^'"]*do=download&amp;r=(\d+)[^'"]*)['"]/g)]
    .map((m) => ({ id: m[2], url: m[1].replace(/&amp;/g, "&") }))
    .filter((l) => /csrfKey=[a-f0-9]+/.test(l.url));
  if (fileId) return links.find((l) => l.id === String(fileId))?.url || null;
  return links.length === 1 ? links[0].url : null;
}

function cookieHeader(response) {
  const raw = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return raw.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

function filenameFrom(disposition) {
  const m = String(disposition || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).replace(/[\\/]/g, "_");
  } catch {
    return m[1].replace(/[\\/]/g, "_");
  }
}

async function resolveDeadlyStreamDownload(pageUrl, fetchImpl = fetch) {
  if (!isDeadlyStreamFilePage(pageUrl)) throw new Error("Not a Deadly Stream file page");
  const page = new URL(pageUrl);
  const fileId = page.searchParams.get("r");
  page.search = "";
  const headers = { "user-agent": USER_AGENT };

  const pageRes = await fetchImpl(page.toString(), { headers, redirect: "follow" });
  if (!pageRes.ok) throw new Error(`Deadly Stream file page returned ${pageRes.status}`);
  const cookie = cookieHeader(pageRes);
  const pageHtml = await pageRes.text();
  const downloadHeaders = { "user-agent": USER_AGENT, cookie };
  let link = fileId ? null : parseDownloadLink(pageHtml, null);
  // No direct link (or a specific file was asked for): use the file chooser.
  if (!link && cookie) {
    const chooser = await fetchImpl(`${page.toString()}?do=download`, { headers: downloadHeaders, redirect: "follow" });
    if (chooser.ok) link = parseChooserLink(await chooser.text(), fileId);
  }
  if (!link || !cookie) throw new Error("Deadly Stream did not offer an anonymous download");

  const probe = await fetchImpl(link, { headers: downloadHeaders, redirect: "manual" });
  try { await probe.body?.cancel?.(); } catch { /* nothing to cancel */ }
  if (probe.status !== 200) throw new Error(`Deadly Stream download returned ${probe.status}`);
  const filename = filenameFrom(probe.headers.get("content-disposition"));
  const length = Number(probe.headers.get("content-length")) || null;
  return { url: link, filename, bytes: length, headers: downloadHeaders };
}

module.exports = { isDeadlyStreamFilePage, parseDownloadLink, parseChooserLink, filenameFrom, resolveDeadlyStreamDownload };
