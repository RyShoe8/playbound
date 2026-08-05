import net from "node:net";
import { MAX_SERVERS } from "./types.js";

const HOST = "netserver.hedgewars.org";
const PORT = 46631;

/** Stable release protocol first (1.0.0 = 59), then nearby versions. */
const PROTO_CANDIDATES = ["59", "58", "57", "60"];

function encodeMsg(cmd, args = []) {
  return [cmd, ...args].join("\n") + "\n\n";
}

/**
 * Parse a flattened ROOMS / ADDROOM field list into room rows.
 * PROTO 46–59 roomInfo: flags, name, playersIn, teams, owner, MAP, SCRIPT, SCHEME, AMMO
 * @param {string[]} fields
 * @returns {import('./types.js').GameServer[]}
 */
function parseRoomFields(fields) {
  /** @type {import('./types.js').GameServer[]} */
  const rooms = [];
  let i = 0;
  const FLAG_RE = /^-[gpjr]*$/;

  while (i < fields.length) {
    let flags = "";
    let nameIdx = i;

    if (FLAG_RE.test(fields[i] || "")) {
      flags = fields[i];
      nameIdx = i + 1;
    }

    const name = fields[nameIdx];
    if (!name || /^\d+$/.test(name) || FLAG_RE.test(name)) {
      i += 1;
      continue;
    }

    // flags + name + players + teams + owner + map + script + scheme + ammo = 9
    // without flags (older layouts): name + players + … 
    const base = nameIdx;
    const players = Number(fields[base + 1]);
    const map = fields[base + 4] || null;
    const script = fields[base + 5] || null;
    const gameType = [script, flags.includes("g") ? "in-game" : null]
      .filter(Boolean)
      .join(" · ") || "hedgewars-lobby";

    rooms.push({
      id: `hw:${name}`,
      name,
      host: HOST,
      port: PORT,
      players: Number.isFinite(players) ? players : 0,
      maxPlayers: null,
      map: map && !/^\d+$/.test(map) ? map : null,
      gameType,
      location: null,
      protected: flags.includes("p"),
    });

    const stride = flags ? 9 : 8;
    let next = -1;
    for (const s of [stride, stride + 1, stride - 1, 9, 10, 8, 7]) {
      const j = i + s;
      if (j >= fields.length) continue;
      const f = fields[j];
      if (FLAG_RE.test(f || "") || (f && !/^\d+$/.test(f))) {
        next = j;
        break;
      }
    }
    if (next < 0) {
      for (let j = i + stride; j < fields.length; j++) {
        if (FLAG_RE.test(fields[j] || "") || (fields[j] && !/^\d+$/.test(fields[j]))) {
          next = j;
          break;
        }
      }
    }
    i = next > i ? next : i + stride;
  }
  return rooms;
}

/**
 * Attempt a single lobby connection with a fixed protocol.
 * @param {string} proto
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
function pollWithProto(proto) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    let buf = "";
    /** @type {Map<string, import('./types.js').GameServer>} */
    const roomMap = new Map();
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
      const rooms = [...roomMap.values()];
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
        const lines = part
          .split("\n")
          .map((l) => l.trimEnd())
          .filter((l) => l.length > 0);
        if (!lines.length) continue;
        const cmd = lines[0];

        if (cmd === "CONNECTED" && !nickSent) {
          nickSent = true;
          const nick = `pb${Math.floor(Math.random() * 1e6)}`;
          socket.write(encodeMsg("NICK", [nick]));
          socket.write(encodeMsg("PROTO", [proto]));
          continue;
        }

        if ((cmd === "LOBBY:JOINED" || cmd === "JOINING" || cmd === "NICK") && !listed) {
          // NICK ack may precede lobby join on some builds
          if (cmd === "NICK") continue;
          listed = true;
          socket.write(encodeMsg("LIST"));
          continue;
        }

        // After PROTO some servers emit READY / LOBBY:JOINED
        if (cmd === "READY" && !listed) {
          listed = true;
          socket.write(encodeMsg("LIST"));
          continue;
        }

        if (cmd === "ROOMS" || cmd === "ADDROOM" || cmd === "UPDROOM") {
          const fields = lines.slice(1);
          if (cmd === "ROOMS" && fields.length === 0) {
            finish(null);
            continue;
          }
          if (cmd === "ADDROOM" || cmd === "UPDROOM") {
            for (const room of parseRoomFields(fields)) {
              roomMap.set(room.id, room);
            }
            continue;
          }
          for (const room of parseRoomFields(fields)) {
            roomMap.set(room.id, room);
          }
          finish(null);
        }

        if (cmd === "ERROR" || cmd === "BYE") {
          if (listed) finish(null);
        }
      }
    });

    socket.on("close", () => finish(null));
  });
}

/**
 * Official Hedgewars lobby rooms.
 * @returns {Promise<import('./types.js').GameServer[]>}
 */
export async function pollHedgewars() {
  let lastErr = null;
  for (const proto of PROTO_CANDIDATES) {
    try {
      const rooms = await pollWithProto(proto);
      if (rooms.length > 0) {
        console.log(`[hedgewars] listed ${rooms.length} rooms with PROTO ${proto}`);
        return rooms;
      }
      // Empty lobby is valid — return after first successful empty PROTO 59
      if (proto === "59") {
        console.log("[hedgewars] PROTO 59 connected with empty lobby");
        return rooms;
      }
    } catch (err) {
      lastErr = err;
      console.warn(
        `[hedgewars] PROTO ${proto} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  if (lastErr) throw lastErr;
  return [];
}
