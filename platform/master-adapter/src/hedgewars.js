import net from "node:net";
import { MAX_SERVERS } from "./types.js";

const HOST = "netserver.hedgewars.org";
const PORT = 46631;

function encodeMsg(cmd, args = []) {
  return [cmd, ...args].join("\n") + "\n\n";
}

/**
 * Official Hedgewars lobby rooms.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollHedgewars() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    let buf = "";
    /** @type {import('./types.js').GameServer[]} */
    const rooms = [];
    let settled = false;
    let nickSent = false;
    let listed = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      if (err && rooms.length === 0) reject(err);
      else {
        rooms.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
        resolve(rooms.slice(0, MAX_SERVERS));
      }
    };

    const timer = setTimeout(() => finish(null), 10_000);

    socket.setEncoding("utf8");
    socket.on("error", (err) => finish(err));

    socket.on("data", (chunk) => {
      buf += chunk;
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) {
        const lines = part.split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);
        if (!lines.length) continue;
        const cmd = lines[0];

        if (cmd === "CONNECTED" && !nickSent) {
          nickSent = true;
          const nick = `pb${Math.floor(Math.random() * 1e6)}`;
          socket.write(encodeMsg("NICK", [nick]));
          socket.write(encodeMsg("PROTO", ["60"]));
          continue;
        }

        if ((cmd === "LOBBY:JOINED" || cmd === "JOINING") && !listed) {
          listed = true;
          socket.write(encodeMsg("LIST"));
          continue;
        }

        if (cmd === "ROOMS" || cmd === "ADDROOM" || cmd === "UPDROOM") {
          const fields = cmd === "ROOMS" ? lines.slice(1) : lines.slice(1);
          if (cmd === "ROOMS" && fields.length === 0) {
            // Empty lobby — still success
            finish(null);
            continue;
          }
          // ADDROOM / roomInfo flattened fields: name is first string
          if (cmd === "ADDROOM" || cmd === "UPDROOM") {
            const name = fields[0];
            if (name) {
              const players = Number(fields[1]) || 0;
              rooms.push({
                id: `hw:${name}`,
                name,
                host: HOST,
                port: PORT,
                players,
                maxPlayers: null,
                map: fields[3] || null,
                gameType: "hedgewars-lobby",
                location: null,
                protected: false,
              });
            }
            continue;
          }
          // ROOMS with many fields — chunk heuristically
          for (let i = 0; i < fields.length; ) {
            const name = fields[i];
            if (!name) {
              i += 1;
              continue;
            }
            const players = Number(fields[i + 1]) || 0;
            rooms.push({
              id: `hw:${name}`,
              name,
              host: HOST,
              port: PORT,
              players,
              maxPlayers: null,
              map: fields[i + 3] || null,
              gameType: "hedgewars-lobby",
              location: null,
              protected: false,
            });
            i += 8;
          }
          finish(null);
        }

        if (cmd === "ERROR" || cmd === "BYE") {
          // Non-fatal if we already have rooms / empty lobby ok
          if (listed) finish(null);
        }
      }
    });

    socket.on("close", () => finish(null));
  });
}
