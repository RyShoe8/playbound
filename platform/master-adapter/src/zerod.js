import { MAX_SERVERS } from "./types.js";

const DOMAIN = "lobby.wildfiregames.com";
const CONFERENCE = `conference.${DOMAIN}`;

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
 * @param {import('@xmpp/xml').Element} gameEl
 * @param {number} index
 * @returns {import('./types.js').GameServer}
 */
function gameFromElement(gameEl, index) {
  const a = gameEl.attrs || {};
  const name = a.name || gameEl.getChildText?.("name") || "0 A.D. game";
  const map = a.mapName || a.map || gameEl.getChildText?.("mapName") || null;
  // nbp = number of players currently; players may be a CSV of names
  let players = Number(a.nbp || a.players || 0);
  if (!Number.isFinite(players) || players < 0) {
    const csv = String(a.players || "");
    players = csv.includes(",") ? csv.split(",").filter(Boolean).length : 0;
  }
  const maxPlayers = Number(a.maxPlayers || a.maxplayers || 0) || null;
  const host =
    a.IP ||
    a.ip ||
    a.hostUsername ||
    a.hostJID ||
    DOMAIN;
  const mods = a.mods || null;
  const state = a.state || null;
  const gameType = [mods, state].filter(Boolean).join(" · ") || "0ad";

  return {
    id: `0ad:${a.hostJID || name}:${index}`,
    name: String(name).slice(0, 256),
    host: String(host),
    port: 20595,
    players: Number(players) || 0,
    maxPlayers: maxPlayers || null,
    map: map ? String(map) : null,
    gameType,
    location: null,
    protected: false,
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
    out.push(gameFromElement(g, out.length));
  }
  return out;
}

/**
 * 0 A.D. XpartaMuPP lobby via modern MUC push flow.
 * Clients must use a resource starting with "0ad" and join a versioned arena room;
 * XpartaMuPP then pushes jabber:iq:gamelist.
 *
 * Without credentials → lobby pointer.
 * With credentials + failure → throws (caller surfaces error; no fake lobby).
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
  const rooms = lobbyRooms();

  const { client, xml } = await import("@xmpp/client");

  /** @type {Map<string, import('./types.js').GameServer>} */
  const byId = new Map();

  const xmpp = client({
    service: `xmpp://${DOMAIN}:5222`,
    domain: DOMAIN,
    resource: "0ad-playbound",
    username,
    password,
  });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, 16_000);

      xmpp.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      xmpp.on("stanza", (stanza) => {
        if (!stanza.is?.("iq")) return;
        const games = gamesFromStanza(stanza);
        for (const g of games) {
          byId.set(g.id, g);
        }
        // Once we have any games, we can finish early after a short settle
        if (byId.size > 0) {
          clearTimeout(timer);
          // Brief settle for multi-room pushes
          setTimeout(() => resolve(null), 800);
        }
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
          clearTimeout(timer);
          reject(err);
        }
      });

      xmpp.start().catch((err) => {
        clearTimeout(timer);
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
  list.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  if (list.length === 0) {
    console.warn("[0ad] authenticated but received no games from MUC push");
  }
  return list.slice(0, MAX_SERVERS);
}
