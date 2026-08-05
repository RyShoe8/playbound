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
 * roomInfo layout varies by protocol; walk by detecting non-numeric name fields.
 * @param {string[]} fields
 * @returns {import('./types.js').GameServer[]}
 */
function parseRoomFields(fields) {
  /** @type {import('./types.js').GameServer[]} */
  const rooms = [];
  let i = 0;
  while (i < fields.length) {
    const name = fields[i];
    if (!name || /^\d+$/.test(name)) {
      i += 1;
      continue;
    }
    // Typical: name, players, teams, inGame, map, scheme, weapons, …
    const players = Number(fields[i + 1]);
    const mapCandidate = fields[i + 4] || fields[i + 3] || null;
    const map =
      mapCandidate && !/^\d+$/.test(mapCandidate) && mapCandidate !== "0" && mapCandidate !== "1"
        ? mapCandidate
        : fields[i + 3] && !/^\d+$/.test(fields[i + 3])
          ? fields[i + 3]
          : null;

    rooms.push({
      id: `hw:${name}`,
      name,
      host: HOST,
      port: PORT,
      players: Number.isFinite(players) ? players : 0,
      maxPlayers: null,
      map,
      gameType: "hedgewars-lobby",
      location: null,
      protected: false,
    });

    // Advance to next likely room name: try common strides, else scan ahead
    let next = -1;
    for (const stride of [8, 9, 10, 7, 11]) {
      const j = i + stride;
      if (j < fields.length && fields[j] && !/^\d+$/.test(fields[j])) {
        next = j;
        break;
      }
    }
    if (next < 0) {
      for (let j = i + 2; j < fields.length; j++) {
        if (fields[j] && !/^\d+$/.test(fields[j]) && j > i + 1) {
          // Prefer skipping at least a few fields between names
          next = j;
          break;
        }
      }
    }
    i = next > i ? next : i + 8;
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
