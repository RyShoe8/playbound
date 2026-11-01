"use strict";

/**
 * Downloading a table from its VPForums file page with the player's own
 * VPForums account.
 *
 * JP Salas, whose 300 VPX tables live there, agreed to PlayBound listing them
 * on the condition that the file always comes from VPForums, so players get
 * his latest version and his support thread. VPForums requires a signed-in
 * member to download (a guest gets 403), and its terms make an account
 * personal, so every player signs in once with their own free account in a
 * launcher window; the session is kept in its own persistent partition and its
 * cookie is only ever sent back to vpforums.org.
 *
 * One download per Install click, from the table's own page, exactly the
 * request a browser makes. Never bulk.
 */

const HOST = "www.vpforums.org";
const PARTITION = "persist:vpforums";
const USER_AGENT = "Mozilla/5.0 PlayBound";

/** https://www.vpforums.org/index.php?app=downloads&showfile=<id> */
function vpforumsFileId(rawUrl) {
  try {
    const u = new URL(String(rawUrl));
    if (u.protocol !== "https:" || !/^(www\.)?vpforums\.org$/i.test(u.hostname) || u.pathname !== "/index.php") return null;
    if (u.searchParams.get("app") !== "downloads") return null;
    const id = u.searchParams.get("showfile");
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function isVpforumsFilePage(rawUrl) {
  return Boolean(vpforumsFileId(rawUrl));
}

/** IP.Board's member_id cookie is "0" for guests and the member number once signed in. */
function isSignedIn(cookies) {
  const member = (cookies || []).find((c) => c.name === "member_id");
  return Boolean(member && member.value && member.value !== "0");
}

function cookieHeader(cookies) {
  return (cookies || []).map((c) => `${c.name}=${c.value}`).join("; ");
}

function absolute(href) {
  const u = new URL(String(href).replace(/&amp;/g, "&"), `https://${HOST}/`);
  return u.hostname.endsWith("vpforums.org") ? u.toString() : null;
}

/**
 * The file page's link to the current version. The page also offers
 * `do=version_download` links, which are older versions: never those.
 */
function parseConfirmLink(html) {
  const m = /href=['"]([^'"]*section=download[^'"]*do=confirm_download[^'"]*)['"]/.exec(String(html));
  return m ? absolute(m[1]) : null;
}

/**
 * The files on the confirm page ("Your files are available below"), each a
 * do_download link with its file name. A VPX table usually ships several:
 * 1-player, 1-player alternative and 4-player tables, each with a separate
 * .directb2s backglass archive for cabinets.
 */
function parseFileList(html) {
  const text = String(html);
  const out = [];
  const re = /href=['"]([^'"]*do=do_download[^'"]*)['"]/g;
  let m;
  while ((m = re.exec(text))) {
    const url = absolute(m[1]);
    if (!url) continue;
    // The file name is the text following the link (its "Download" label first).
    const rest = text.slice(re.lastIndex);
    const close = rest.indexOf(">");
    const after = rest
      .slice(close + 1, close + 600)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const name = (/^(?:Download\s+)?(.+?\.(?:zip|rar|7z|vpx))\b/i.exec(after) || [])[1] || null;
    out.push({ url, name });
  }
  return out;
}

/**
 * Which file is the table. `pattern` (from the catalog) wins; otherwise the
 * 4-player table, so a couch party can take turns, then any table archive.
 * Backglasses, PUP packs and media are never chosen.
 */
function chooseTableFile(files, pattern) {
  const tables = files.filter((f) => !/directb2s|\bb2s\b|pup|media|manual|rom/i.test(f.name || ""));
  if (pattern) {
    const re = new RegExp(pattern, "i");
    return tables.find((f) => re.test(f.name || "")) || null;
  }
  return tables.find((f) => /\b4\s?p\b/i.test(f.name || "")) || tables[0] || null;
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

class VpforumsSignInRequired extends Error {
  constructor() {
    super("Sign in to VPForums to download this table.");
    this.code = "VPFORUMS_SIGNIN_REQUIRED";
  }
}

/**
 * The file's URL, name and the cookie header to send with it.
 *
 * `getCookies()` returns the partition's vpforums.org cookies. The page's
 * Download button leads either straight to the file or to a confirm page that
 * lists the files; both are followed, and the first response that is not HTML
 * is the download.
 */
async function resolveVpforumsDownload(pageUrl, { getCookies, filePattern = null, fetchImpl = fetch }) {
  const id = vpforumsFileId(pageUrl);
  if (!id) throw new Error("Not a VPForums file page");
  const cookies = await getCookies();
  // No session at all: ask straight away. Otherwise the page decides, since
  // member_id is only set when "Remember me" was ticked.
  if (!cookies?.length) throw new VpforumsSignInRequired();
  const headers = { "user-agent": USER_AGENT, cookie: cookieHeader(cookies) };
  const page = `https://${HOST}/index.php?app=downloads&showfile=${id}`;

  const pageRes = await fetchImpl(page, { headers, redirect: "follow" });
  if (!pageRes.ok) throw new Error(`VPForums file page returned ${pageRes.status}`);
  const confirm = parseConfirmLink(await pageRes.text());
  // A signed-out (or expired) session sees no download button at all.
  if (!confirm) throw new VpforumsSignInRequired();

  const confirmRes = await fetchImpl(confirm, { headers: { ...headers, referer: page }, redirect: "follow" });
  if (confirmRes.status === 403) throw new VpforumsSignInRequired();
  if (!confirmRes.ok) throw new Error(`VPForums download page returned ${confirmRes.status}`);
  const file = chooseTableFile(parseFileList(await confirmRes.text()), filePattern);
  if (!file) throw new Error("VPForums did not list a table file for this download");
  return { url: file.url, filename: file.name, headers: { ...headers, referer: confirm } };
}

module.exports = {
  HOST,
  PARTITION,
  vpforumsFileId,
  isVpforumsFilePage,
  isSignedIn,
  cookieHeader,
  parseConfirmLink,
  parseFileList,
  chooseTableFile,
  filenameFrom,
  resolveVpforumsDownload,
  VpforumsSignInRequired,
};
