"use strict";

/**
 * Resolve a ModDB file page to the signed CDN URL its mirror redirects to.
 *
 * ModDB has no stable download URL: a file page links to /downloads/start/<id>,
 * which links to /downloads/mirror/<id>/<n>/<token>, which 302s to a signed,
 * short-lived URL on dbolical.com. The catalog therefore stores the permanent
 * file-page URL and the launcher walks the three hops at install time.
 *
 * Only ModDB's own pages are fetched and only a dbolical.com / moddb.com HTTPS
 * redirect target is accepted, so a changed page can't point the launcher at an
 * arbitrary host. The page's MD5 is returned so the caller can verify the file.
 */

const USER_AGENT = "Mozilla/5.0 PlayBound";

/** https://www.moddb.com/<mods|addons|games|engines>/<slug>/downloads/<file-slug> */
function isModdbFilePage(rawUrl) {
  try {
    const u = new URL(String(rawUrl));
    return u.protocol === "https:" && /^(www\.)?moddb\.com$/i.test(u.hostname) &&
      /^\/(mods|addons|games|engines)\/[^/]+\/downloads\/[^/]+\/?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function cell(html, label) {
  const m = String(html).match(new RegExp(`<h5>\\s*${label}\\s*</h5>\\s*<span class="summary">([\\s\\S]*?)</span>`, "i"));
  return m ? m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";
}

function parseModdbFilePage(html) {
  const filename = cell(html, "Filename");
  const md5 = cell(html, "MD5 Hash").toLowerCase();
  const startId = String(html).match(/\/downloads\/start\/(\d+)/i)?.[1] || null;
  return { filename, md5: /^[a-f0-9]{32}$/.test(md5) ? md5 : null, startId };
}

function mirrorPath(html) {
  const href = String(html).match(/href="(\/downloads\/mirror\/\d+\/\d+\/[A-Za-z0-9]+)"/i)?.[1];
  if (!href) throw new Error("ModDB did not offer a download mirror");
  return href;
}

function assertCdnUrl(location) {
  const u = new URL(location);
  if (u.protocol !== "https:" || !/(^|\.)(dbolical|moddb)\.com$/i.test(u.hostname)) {
    throw new Error("ModDB returned an unexpected download host");
  }
  return u.toString();
}

/**
 * moddb.com sits behind Cloudflare, which answers Node's own fetch with 403 but
 * serves Chromium's network stack. Inside the launcher use Electron's net.fetch;
 * the signed dbolical.com CDN URL it resolves to downloads fine with plain fetch.
 */
function defaultFetch() {
  try {
    const { net } = require("electron");
    if (net && typeof net.fetch === "function") return net.fetch.bind(net);
  } catch {
    /* not running under Electron */
  }
  return fetch;
}

/**
 * Read the redirect a ModDB mirror answers with, without following it.
 * Electron's net.fetch refuses redirect:"manual", so inside the launcher use
 * net.request, which reports the Location through its "redirect" event; outside
 * Electron (tests, scripts) a manual plain fetch does the same job.
 */
function defaultRedirectTarget(url, referer) {
  let net = null;
  try { net = require("electron").net; } catch { /* not running under Electron */ }
  if (net && typeof net.request === "function") {
    return new Promise((resolve, reject) => {
      const req = net.request({ url, redirect: "manual" });
      req.setHeader("user-agent", USER_AGENT);
      req.setHeader("referer", referer);
      const timer = setTimeout(() => { req.abort(); reject(new Error("ModDB mirror timed out")); }, 20000);
      req.on("redirect", (_status, _method, location) => { clearTimeout(timer); req.abort(); resolve(location); });
      req.on("response", (res) => { clearTimeout(timer); req.abort(); reject(new Error(`ModDB mirror did not redirect (${res.statusCode})`)); });
      req.on("error", (err) => { clearTimeout(timer); reject(err); });
      req.end();
    });
  }
  return fetch(url, { headers: { "user-agent": USER_AGENT, referer }, redirect: "manual" }).then((res) => {
    const location = res.headers.get("location");
    if (!location) throw new Error(`ModDB mirror did not redirect (${res.status})`);
    return new URL(location, url).toString();
  });
}

async function resolveModdbDownload(pageUrl, fetchImpl = defaultFetch(), redirectTarget = defaultRedirectTarget) {
  if (!isModdbFilePage(pageUrl)) throw new Error("Not a ModDB file page");
  const headers = { "user-agent": USER_AGENT };
  const pageRes = await fetchImpl(pageUrl, { headers });
  if (!pageRes.ok) throw new Error(`ModDB file page returned ${pageRes.status}`);
  const { filename, md5, startId } = parseModdbFilePage(await pageRes.text());
  if (!startId) throw new Error("ModDB file page has no download link");

  const startUrl = `https://www.moddb.com/downloads/start/${startId}`;
  const startRes = await fetchImpl(startUrl, { headers });
  if (!startRes.ok) throw new Error(`ModDB download page returned ${startRes.status}`);
  const mirror = new URL(mirrorPath(await startRes.text()), "https://www.moddb.com").toString();

  const landed = await redirectTarget(mirror, startUrl);
  return { url: assertCdnUrl(new URL(landed, mirror).toString()), filename, md5 };
}

module.exports = { isModdbFilePage, parseModdbFilePage, mirrorPath, assertCdnUrl, resolveModdbDownload };
