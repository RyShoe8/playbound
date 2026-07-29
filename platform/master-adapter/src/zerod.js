import { MAX_SERVERS } from "./types.js";

/**
 * 0 A.D. XpartaMuPP lobby.
 * With ZEROAD_LOBBY_JID + ZEROAD_LOBBY_PASSWORD, queries the XMPP game list.
 * Without credentials, returns a lobby pointer so the title stays wired.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollZeroAd() {
  const jid = process.env.ZEROAD_LOBBY_JID;
  const password = process.env.ZEROAD_LOBBY_PASSWORD;
  if (!jid || !password) {
    return [
      {
        id: "0ad:lobby",
        name: "0 A.D. Multiplayer Lobby",
        host: "lobby.wildfiregames.com",
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

  try {
    const { client, xml } = await import("@xmpp/client");
    const xmpp = client({
      service: "xmpp://lobby.wildfiregames.com:5222",
      domain: "lobby.wildfiregames.com",
      username: jid.includes("@") ? jid.split("@")[0] : jid,
      password,
    });

    /** @type {import('./types.js').GameServer[]} */
    const servers = [];

    const list = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          xmpp.stop();
        } catch {
          /* ignore */
        }
        resolve(servers);
      }, 15_000);

      xmpp.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      xmpp.on("online", async () => {
        try {
          // XpartaMuPP game list IQ (namespace used by 0 A.D. lobby bots)
          const iq = xml(
            "iq",
            { type: "get", to: "xpartamupp@lobby.wildfiregames.com" },
            xml("query", { xmlns: "jabber:iq:gamelist" })
          );
          const res = await xmpp.iqCaller.request(iq, 10_000);
          const games = res.getChild("query")?.getChildren("game") || [];
          for (const g of games) {
            if (servers.length >= MAX_SERVERS) break;
            const name = g.attrs.name || g.getChildText("name") || "0 A.D. game";
            const map = g.attrs.mapName || g.getChildText("mapName") || null;
            const players = Number(g.attrs.players || g.getChildText("players") || 0) || 0;
            const maxPlayers = Number(g.attrs.maxPlayers || g.getChildText("maxPlayers") || 0) || null;
            const host =
              g.attrs.hostJID ||
              g.attrs.ip ||
              g.getChildText("hostJID") ||
              "lobby.wildfiregames.com";
            servers.push({
              id: `0ad:${name}:${servers.length}`,
              name,
              host: String(host),
              port: 20595,
              players,
              maxPlayers: maxPlayers || null,
              map,
              gameType: "0ad",
              location: null,
              protected: false,
            });
          }
        } catch (err) {
          clearTimeout(timer);
          reject(err);
          return;
        }
        clearTimeout(timer);
        try {
          await xmpp.stop();
        } catch {
          /* ignore */
        }
        resolve(servers);
      });

      xmpp.start().catch(reject);
    });

    if (list.length) {
      list.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
      return list.slice(0, MAX_SERVERS);
    }
  } catch (err) {
    console.warn("[0ad]", err instanceof Error ? err.message : err);
  }

  return [
    {
      id: "0ad:lobby",
      name: "0 A.D. Multiplayer Lobby",
      host: "lobby.wildfiregames.com",
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
