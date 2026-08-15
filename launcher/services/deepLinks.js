/**
 * deepLinks.js — parsing playbound:// URLs.
 *
 * Worth isolating because this is an attack surface rather than a convenience:
 * a deep link can be triggered by any web page the user visits, or by a link in
 * a chat message, so whatever this function returns is attacker-influenced by
 * definition. Everything downstream treats the parsed result as a command, so
 * the parser is the place where untrusted input stops being untrusted.
 *
 * Two rules follow from that:
 *
 *   1. Never return a field the caller can act on without checking. The
 *      ?token= field was removed for exactly this reason — see the comment on
 *      the "link" branch.
 *   2. Unknown actions return null, not a partially-filled object.
 *
 * Pure and dependency-free, so deepLinks.test.js can cover it directly.
 */

/** Actions that address a specific game or mod by slug. */
const SLUG_ACTIONS = [
  "install",
  "play",
  "uninstall",
  "join",
  "install-mod",
  "play-mod",
  "open-folder",
  "open-folder-mod",
  "uninstall-mod",
  "locate",
];

/** Actions that may carry ?edition=. */
const EDITION_ACTIONS = new Set(["install", "play", "uninstall"]);

/**
 * @param {string} protocol Scheme name without "://", e.g. "playbound".
 */
function createDeepLinks(protocol) {
  const schemePrefix = new RegExp(`^${protocol}://`, "i");

  /**
   * Parse a deep link into an action, or null if it is not one we handle.
   *
   *   playbound://install/openra[?edition=…]
   *   playbound://play/warzone-2100
   *   playbound://uninstall/openra
   *   playbound://install-mod/my-mod
   *   playbound://play-mod/my-mod
   *   playbound://open-folder/openra
   *   playbound://open-folder-mod/my-mod
   *   playbound://uninstall-mod/my-mod
   *   playbound://locate/naev
   *   playbound://join/openra?host=1.2.3.4&port=1234&name=Server
   *   playbound://auth
   *   playbound://sync
   *   playbound://link?code=…
   *
   * @returns {{ action: string, [key: string]: unknown } | null}
   */
  function parseDeepLink(url) {
    try {
      const raw = String(url);
      /*
       * Our scheme and no other. Without this, rewriting only the matching
       * prefix left a foreign scheme intact and the parser read its host as an
       * action — "steam://install/1234" came back as an install of slug 1234.
       * Callers reached from argv filter on the prefix already, but the
       * open-deep-link IPC does not, so the check belongs here.
       */
      if (!schemePrefix.test(raw)) return null;
      // Rewritten to https so the WHATWG URL parser populates hostname,
      // pathname and searchParams; custom schemes are treated as opaque.
      const u = new URL(raw.replace(schemePrefix, "https://"));
      const action = u.hostname.toLowerCase();
      if (action === "auth") return { action: "auth" };
      if (action === "sync") return { action: "sync" };
      if (action === "link") {
        /*
         * Only the one-time code is accepted. A durable bearer used to be
         * honoured here too, which meant any web page could navigate to
         * playbound://link?token=<their own token> and silently rebind someone
         * else's launcher to the attacker's account — handing over their
         * library and every cloud save written afterwards. The site has only
         * ever minted ?code= (see lib/launcher.ts), so nothing legitimate used
         * that path. Do not reintroduce a field here that is itself a
         * credential.
         */
        return { action: "link", code: u.searchParams.get("code") || "" };
      }
      const slug = u.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
      if (!slug || !SLUG_ACTIONS.includes(action)) return null;
      /*
       * A slug names one game or mod and is used to look up install state and
       * build paths, so it must not carry a path separator of its own. Every
       * documented link is single-segment; "install/a/b" was previously
       * returned as the slug "a/b".
       */
      if (slug.includes("/")) return null;

      /** @type {{ action: string, slug: string, host?: string, port?: number, name?: string, editionSlug?: string }} */
      const parsed = { action, slug };
      if (action === "join") {
        parsed.host = u.searchParams.get("host") || "";
        // Number("abc") is NaN, which used to reach the join path as a port.
        const port = Number(u.searchParams.get("port") || 0);
        parsed.port = Number.isFinite(port) ? port : 0;
        parsed.name = u.searchParams.get("name") || "";
      }
      if (EDITION_ACTIONS.has(action)) {
        const edition = u.searchParams.get("edition");
        if (edition) parsed.editionSlug = edition;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /** A sign-in handoff, or null. Only ever a one-time code. */
  function extractLinkHandoff(url) {
    try {
      const parsed = parseDeepLink(url);
      if (parsed?.action === "link" && parsed.code) return parsed;
    } catch {
      /* ignore */
    }
    return null;
  }

  return { parseDeepLink, extractLinkHandoff };
}

module.exports = { createDeepLinks, SLUG_ACTIONS };
