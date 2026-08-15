/**
 * security.js — the launcher's trust boundaries.
 *
 * Three questions live here: which origin may we treat as the API, which hosts
 * may we download an executable from, and which URLs may we hand to the OS.
 * They were spread through main.js as a wall of one-line host tests, which made
 * them hard to review and impossible to unit test — see security.test.js, which
 * checks this module against the original logic host-for-host.
 *
 * The download list is the one that matters most: the launcher runs what it
 * downloads, so this is what contains a compromised or rogue catalog entry.
 * Two rules when editing it:
 *
 *   1. Never use an unanchored substring test. "sourceforge.net" as a substring
 *      also accepts sourceforge.net.attacker.example.
 *   2. Prefer exactOrSubdomain() over hand-written endsWith chains.
 */

/** Exact host, or any subdomain of it. The safe default for an allowlist. */
function exactOrSubdomain(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

/**
 * Domains trusted at the apex and below.
 *
 * Each entry means "this host or anything under it", so adding one grants every
 * subdomain — only list domains whose DNS we believe is controlled by the
 * project that owns the download.
 */
const DOWNLOAD_DOMAINS = [
  // Project download sites reached by one-click recipes.
  "sourceforge.net",
  "gitlab.com",
  "zero-k.info",
  "hedgewars.org",
  "openarena.ws",
  "megaphilx.com",
  "villagersandheroes.com",
  "bzflag.org",
  "scummvm.org",
  "itch.io",
  "archive.org",
  "codeberg.org",
  "myabandonware.com",
  "allegro.cc",
  // Brewall's EverQuest map packs — see verifiedModsWave.ts.
  "eqmaps.info",
  // MMOs that ship their own installer — see launcherInstallBySlug in
  // platform/src/lib/data/launcherInstall.ts.
  "albiononline.com",
  "guildwars2.com",
  "arena.net",
  "lotro.com",
  "daybreakgames.com",
  "swtor.com",
  "runescape.com",
  "xsolla.com",
];

/**
 * Suffixes trusted only below the apex.
 *
 * These are shared-tenant CDNs and object stores: the apex belongs to the
 * provider, not to us, so only the subdomain form is meaningful. Note that
 * anyone can put a file on most of these — they are here because real catalog
 * downloads redirect through them, and the checksum in the recipe is what
 * actually authenticates the payload.
 */
const DOWNLOAD_SUFFIXES = [
  ".githubusercontent.com",
  ".adoptium.net",
  /*
   * Project sites whose apex was never allowed — the original rules paired a
   * named host (cdn., files., dl., releases., download., contentdb., content.)
   * with a dotted suffix, so only subdomains ever passed. Kept that way
   * deliberately: security.test.js compares against the original decision for
   * every host, and promoting these to the apex form fails it.
   */
  ".openttd.org",
  ".luanti.org",
  ".minetest.net",
  ".freeciv.org",
  ".xonotic.org",
  ".wildfiregames.com",
  ".flightgear.org",
  ".vercel-storage.com",
  ".gitlab-static.net",
  ".itch.zone",
  ".r2.cloudflarestorage.com",
  ".hwcdn.net",
  ".s3.amazonaws.com",
  ".cloudfront.net",
  ".fastly.net",
  ".akamaihd.net",
  ".azureedge.net",
];

/** itch.io's mirror hosts. Anchored at both ends; see rule 1 above. */
const ITCHIO_MIRROR = /^itchio-mirror[a-z0-9-]*\.(hwcdn\.net|b-cdn\.net)$/;

/** Origins the settings UI may retarget as API base. */
const ALLOWED_API_BASE_HOSTS = new Set([
  "playbound.club",
  "www.playbound.club",
  "localhost",
  "127.0.0.1",
]);

/** Loopback may be plain http; everything else must be https. */
function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function httpsOrLoopback(u) {
  return u.protocol === "https:" || (u.protocol === "http:" && isLoopback(u.hostname));
}

/**
 * @param {object} deps
 * @param {() => boolean} deps.isPackaged   Whether this is a shipped build.
 * @param {() => string}  deps.getApiBase   Current API origin; read lazily to
 *                                          avoid a cycle with settings.js.
 */
function createSecurity({ isPackaged, getApiBase }) {
  /** Hosts learned from catalog and edition payloads served by our own API. */
  const dynamicAllowedDownloadHosts = new Set();

  function registerDownloadHostFromUrl(rawUrl) {
    try {
      if (!rawUrl) return;
      const u = new URL(String(rawUrl));
      if (u.hostname) {
        dynamicAllowedDownloadHosts.add(u.hostname.toLowerCase());
      }
    } catch {
      /* ignore */
    }
  }

  function registerCatalogEntryHosts(entry) {
    if (!entry || typeof entry !== "object") return;
    registerDownloadHostFromUrl(entry.url);
    registerDownloadHostFromUrl(entry.downloadUrl);
    registerDownloadHostFromUrl(entry.coverImage);
    if (Array.isArray(entry.addons)) {
      for (const addon of entry.addons) {
        registerDownloadHostFromUrl(addon?.url);
      }
    }
    if (entry.installConfig && typeof entry.installConfig === "object") {
      for (const val of Object.values(entry.installConfig)) {
        if (val && typeof val === "object" && val.url) {
          registerDownloadHostFromUrl(val.url);
        }
      }
    }
  }

  /**
   * Whether a Vercel preview deployment may be trusted as an origin.
   *
   * "*.vercel.app whose name contains 'playbound'" is not a restriction: any
   * Vercel user can claim a project name carrying our brand. That matters more
   * than it looks, because the API base decides which catalog we trust and
   * catalog entries register their own download hosts — so accepting a
   * stranger's preview deployment ends in the launcher running that stranger's
   * binary. Previews stay available while developing and are refused outright
   * by a shipped build.
   */
  function isTrustedPreviewHost(host) {
    if (isPackaged()) return false;
    return host.endsWith(".vercel.app") && host.includes("playbound");
  }

  function isAllowedApiBase(raw) {
    try {
      const u = new URL(String(raw || "").replace(/\/$/, ""));
      if (!httpsOrLoopback(u)) return false;
      const host = u.hostname.toLowerCase();
      if (ALLOWED_API_BASE_HOSTS.has(host)) return true;
      if (isTrustedPreviewHost(host)) return true;
      return false;
    } catch {
      return false;
    }
  }

  function hostAllowedForDownload(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (!host) return false;
    if (dynamicAllowedDownloadHosts.has(host)) return true;
    // GitHub itself is pinned to the two apex forms; its asset traffic arrives
    // on githubusercontent and the objects-* hosts instead.
    if (host === "github.com" || host === "www.github.com") return true;
    if (host.endsWith(".github.com") && host.includes("objects")) return true;
    if (DOWNLOAD_DOMAINS.some((d) => exactOrSubdomain(host, d))) return true;
    if (DOWNLOAD_SUFFIXES.some((s) => host.endsWith(s))) return true;
    if (ITCHIO_MIRROR.test(host)) return true;
    try {
      const apiHost = new URL(getApiBase()).hostname.toLowerCase();
      if (host === apiHost) return true;
    } catch {
      /* ignore */
    }
    if (ALLOWED_API_BASE_HOSTS.has(host)) return true;
    if (isTrustedPreviewHost(host)) return true;
    return false;
  }

  function assertDownloadUrl(raw) {
    let u;
    try {
      u = new URL(String(raw || ""));
    } catch {
      throw new Error("Invalid download URL");
    }
    if (!httpsOrLoopback(u)) {
      throw new Error("Download URL must be https");
    }
    if (!hostAllowedForDownload(u.hostname)) {
      throw new Error(`Download host not allowed: ${u.hostname}`);
    }
    return u.toString();
  }

  /**
   * Schemes we will hand to the OS.
   *
   * Deliberately a short allowlist rather than a denylist: shell.openExternal
   * resolves whatever the OS has registered, so file:, and on Windows anything
   * from ms-msdt: to a custom handler installed by another app, would otherwise
   * be reachable from a catalog URL.
   */
  function assertOpenExternalUrl(raw) {
    let u;
    try {
      u = new URL(String(raw || ""));
    } catch {
      throw new Error("Invalid URL");
    }
    const proto = u.protocol.toLowerCase();
    if (proto === "https:") return u.toString();
    if (proto === "http:" && isLoopback(u.hostname)) return u.toString();
    if (proto === "mailto:") return u.toString();
    // Steam install / run deep links from catalog external recipes.
    if (proto === "steam:") return u.toString();
    throw new Error(`Blocked external URL scheme: ${proto}`);
  }

  return {
    registerDownloadHostFromUrl,
    registerCatalogEntryHosts,
    isTrustedPreviewHost,
    isAllowedApiBase,
    hostAllowedForDownload,
    assertDownloadUrl,
    assertOpenExternalUrl,
    dynamicAllowedDownloadHosts,
  };
}

module.exports = { createSecurity, exactOrSubdomain, ALLOWED_API_BASE_HOSTS };
