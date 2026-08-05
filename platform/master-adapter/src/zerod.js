import { MAX_SERVERS } from "./types.js";
import { resolveZeroAdSaslPassword } from "./zeroad-password.js";

const DOMAIN = "lobby.wildfiregames.com";
const CONFERENCE = `conference.${DOMAIN}`;
const SETTLE_AFTER_IQ_MS = 2_500;
const HARD_CAP_MS = 12_000;

/**
 * Placeholder when no credentials are configured (wired but unauthenticated).
 * @returns {import('./types.js').GameServer[]}
 */
function lobbyPointer() {
  return [
    {
      id: "0ad:lobby",
      name: "0 A.D. Multiplayer Lobby",
      host: DOMAIN,
      port: 5222,
      players: 0,
      maxPlayers: null,
      map: null,
      gameType: "0ad-lobby",
      location: null,
      protected: false,
    },
  ];
}

/**
 * Versioned MUC rooms (Alpha N → arenaN). Override with ZEROAD_LOBBY_ROOMS=arena27,arena26
 * @returns {string[]}
 */
function lobbyRooms() {
  const raw = process.env.ZEROAD_LOBBY_ROOMS || "arena27,arena26,arena";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string | null | undefined} modsRaw
 * @returns {string | null}
 */
function versionFromMods(modsRaw) {
  if (!modsRaw) return null;
  try {
    const mods = JSON.parse(modsRaw);
    if (!Array.isArray(mods)) return null;
    const preferred =
      mods.find((m) => m && (m.name === "0ad" || m.mod === "public")) ||
      mods.find((m) => m?.version) ||
      null;
    return preferred?.version ? String(preferred.version) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} mapName
 * @param {string | null | undefined} niceMapName
 * @returns {string | null}
 */
function displayMap(mapName, niceMapName) {
  if (niceMapName && String(niceMapName).trim()) return String(niceMapName).trim();
  if (!mapName) return null;
  const s = String(mapName).replace(/\\/g, "/");
  const base = s.includes("/") ? s.slice(s.lastIndexOf("/") + 1) : s;
  return base || null;
}

/**
 * @param {import('@xmpp/xml').Element} gameEl
 * @returns {import('./types.js').GameServer}
 */
function gameFromElement(gameEl) {
  const a = gameEl.attrs || {};
  const name = a.name || gameEl.getChildText?.("name") || "0 A.D. game";
  const niceMapName = a.niceMapName || null;
  const mapName = a.mapName || a.map || gameEl.getChildText?.("mapName") || null;

  let players = Number(a.nbp);
  if (!Number.isFinite(players) || players < 0) {
    const csv = String(a.players || "");
    players = csv.includes(",")
      ? csv.split(",").filter(Boolean).length
      : Number(a.players) || 0;
  }

  const maxPlayers = Number(a.maxnbp || a.maxPlayers || a.maxplayers || 0) || null;
  const ip = a.IP || a.ip || null;
  const hostUsername = a.hostUsername || null;
  const hostJID = a.hostJID || null;
  const host = ip || hostUsername || hostJID || DOMAIN;
  const version = versionFromMods(a.mods);
  const state = a.state || null;
  const gameType = [version, state].filter(Boolean).join(" · ") || "0ad";
  const hasPassword = a.hasPassword === "true" || a.hasPassword === "1";

  return {
    id: `0ad:${hostJID || hostUsername || name}`,
    name: String(name).slice(0, 256),
    host: String(host),
    port: 20595,
    players: Number.isFinite(players) ? Math.max(0, players) : 0,
    maxPlayers,
    map: displayMap(mapName, niceMapName),
    gameType,
    location: null,
    protected: Boolean(hasPassword),
  };
}

/**
 * Extract games from a gamelist IQ stanza.
 * @param {import('@xmpp/xml').Element} stanza
 * @returns {import('./types.js').GameServer[]}
 */
function gamesFromStanza(stanza) {
  const query =
    stanza.getChild?.("query", "jabber:iq:gamelist") ||
    stanza.getChild?.("query");
  if (!query) return [];
  const children = query.getChildren?.("game") || [];
  /** @type {import('./types.js').GameServer[]} */
  const out = [];
  for (const g of children) {
    if (out.length >= MAX_SERVERS) break;
    out.push(gameFromElement(g));
  }
  return out;
}

/**
 * 0 A.D. XpartaMuPP lobby via modern MUC push flow.
 * Clients must use a resource starting with "0ad" and join a versioned arena room;
 * XpartaMuPP then pushes jabber:iq:gamelist.
 *
 * @param {{ username?: string, password?: string } | null} [creds]
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollZeroAd(creds = null) {
  const jid = creds?.username || process.env.ZEROAD_LOBBY_JID;
  const password = creds?.password || process.env.ZEROAD_LOBBY_PASSWORD;
  if (!jid || !password) {
    return lobbyPointer();
  }

  const username = jid.includes("@") ? jid.split("@")[0] : jid;
  const saslPassword = resolveZeroAdSaslPassword(password, username);
  const rooms = lobbyRooms();

  const { client, xml } = await import("@xmpp/client");

  /** @type {Map<string, import('./types.js').GameServer>} */
  const byId = new Map();
  const resource = `0ad-pb-${Math.floor(Math.random() * 1e9).toString(36)}`;

  const xmpp = client({
    service: `xmpp://${DOMAIN}:5222`,
    domain: DOMAIN,
    resource,
    username,
    password: saslPassword,
  });

  try {
    await new Promise((resolve, reject) => {
      let settleTimer = null;
      const hardTimer = setTimeout(() => {
        if (settleTimer) clearTimeout(settleTimer);
        resolve(null);
      }, HARD_CAP_MS);

      const finish = () => {
        clearTimeout(hardTimer);
        if (settleTimer) clearTimeout(settleTimer);
        resolve(null);
      };

      xmpp.on("error", (err) => {
        clearTimeout(hardTimer);
        if (settleTimer) clearTimeout(settleTimer);
        reject(err);
      });

      xmpp.on("stanza", (stanza) => {
        if (!stanza.is?.("iq")) return;
        const games = gamesFromStanza(stanza);
        if (!games.length) return;

        // Full-list semantics: each gamelist IQ replaces the snapshot.
        byId.clear();
        for (const g of games) {
          byId.set(g.id, g);
        }

        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(finish, SETTLE_AFTER_IQ_MS);
      });

      xmpp.on("online", async (address) => {
        try {
          console.log(`[0ad] online as ${address?.toString?.() || address}`);
          const nick = `pb${Math.floor(Math.random() * 1e6)}`;
          for (const room of rooms) {
            const to = `${room}@${CONFERENCE}/${nick}`;
            await xmpp.send(
              xml("presence", { to }, xml("x", { xmlns: "http://jabber.org/protocol/muc" }))
            );
          }
        } catch (err) {
          clearTimeout(hardTimer);
          if (settleTimer) clearTimeout(settleTimer);
          reject(err);
        }
      });

      xmpp.start().catch((err) => {
        clearTimeout(hardTimer);
        if (settleTimer) clearTimeout(settleTimer);
        reject(err);
      });
    });
  } catch (err) {
    try {
      await xmpp.stop();
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[0ad] lobby auth/list failed:", message);
    throw new Error(`0 A.D. lobby failed: ${message}`);
  }

  try {
    await xmpp.stop();
  } catch {
    /* ignore */
  }

  const list = [...byId.values()];
  list.sort(
    (a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name)
  );
  console.log(`[0ad] gamelist snapshot size=${list.length}`);
  if (list.length === 0) {
    console.warn("[0ad] authenticated but received no games from MUC push");
  }
  return list.slice(0, MAX_SERVERS);
}
