import net from "node:net";
import { MAX_SERVERS } from "./types.js";

const HOST = "zero-k.info";
const PORT = 8200;

/**
 * Zero-K ZKS lobby. Always returns online presence from Welcome.
 * With ZEROK_LOBBY_USER + ZEROK_LOBBY_PASS, attempts Login and collects BattleAdded.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollZeroK() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    let buf = "";
    /** @type {import('./types.js').GameServer[]} */
    const battles = [];
    let welcome = null;
    let settled = false;
    let loginSent = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      if (err && !welcome) {
        reject(err);
        return;
      }
      if (battles.length) {
        battles.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
        resolve(battles.slice(0, MAX_SERVERS));
        return;
      }
      const users = Number(welcome?.UserCount) || 0;
      resolve([
        {
          id: "zero-k:lobby",
          name: `Zero-K Lobby (${users} users online)`,
          host: HOST,
          port: PORT,
          players: users,
          maxPlayers: null,
          map: welcome?.Game || null,
          gameType: welcome?.Engine || "zero-k-lobby",
          location: null,
          protected: false,
        },
      ]);
    };

    const timer = setTimeout(() => finish(null), 12_000);

    socket.setEncoding("utf8");
    socket.on("error", (err) => finish(err));
    socket.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const space = trimmed.indexOf(" ");
        const cmd = space > 0 ? trimmed.slice(0, space) : trimmed;
        const jsonStr = space > 0 ? trimmed.slice(space + 1) : "{}";
        let payload = {};
        try {
          payload = JSON.parse(jsonStr);
        } catch {
          /* ignore */
        }

        if (cmd === "Welcome") {
          welcome = payload;
          const user = process.env.ZEROK_LOBBY_USER;
          const pass = process.env.ZEROK_LOBBY_PASS;
          if (user && pass && !loginSent) {
            loginSent = true;
            socket.write(
              `Login ${JSON.stringify({
                Name: user,
                PasswordHash: pass,
                UserID: 0,
                LobbyVersion: "PlayBound",
                ClientType: 1,
              })}\n`
            );
          } else {
            // No credentials — finish with presence row after a short settle
            setTimeout(() => finish(null), 400);
          }
        }

        if (cmd === "LoginResponse") {
          // ResultCode 0 typically ok — keep listening for battles
          if (payload.ResultCode && payload.ResultCode !== 0) {
            setTimeout(() => finish(null), 500);
          }
        }

        if (cmd === "BattleAdded" || cmd === "UpdateBattle") {
          const h = payload.Header || payload;
          const title = h.Title || h.title || "Zero-K battle";
          const map = h.Map || h.map || null;
          const players = Number(h.PlayerCount ?? h.Players ?? h.playerCount ?? 0) || 0;
          const maxPlayers = h.MaxPlayers != null ? Number(h.MaxPlayers) : null;
          const ip = h.Ip || h.IP || h.Host || HOST;
          const port = Number(h.Port || PORT) || PORT;
          battles.push({
            id: String(h.BattleID || h.battleId || `${title}:${battles.length}`),
            name: title,
            host: String(ip),
            port,
            players,
            maxPlayers,
            map,
            gameType: h.Game || h.Mode || "zero-k",
            location: null,
            protected: Boolean(h.Password || h.IsPassworded),
          });
        }

        if (cmd === "BattleRemoved") {
          /* ignore for snapshot poll */
        }
      }
    });

    socket.on("close", () => finish(null));
  });
}
