/**
 * Quake 3 rcon, for the games on this box that speak it.
 *
 * This lives on the agent because a game server listens on a UDP port here and
 * nothing in the platform can reach it. The password never leaves: it is
 * generated per room at spawn, kept beside the room in memory, and used only to
 * sign commands the platform asks for. publicRoom deliberately does not carry
 * it, so the platform can ask for a map change without ever being able to
 * administer the server behind our back.
 *
 * The protocol is one connectionless UDP packet each way:
 *
 *   -> \xff\xff\xff\xff rcon <password> <command>
 *   <- \xff\xff\xff\xff print\n<text>
 *
 * There is no ack and no sequence. A lost packet is a lost command, so a caller
 * that needs to know a change took should read the value back rather than
 * trusting the send.
 */

import dgram from "node:dgram";
import crypto from "node:crypto";
import net from "node:net";

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const DEFAULT_TIMEOUT_MS = 2500;

/** A password that is never shown to anyone, so length is the only property that matters. */
export function generateRconPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

/**
 * Send one rcon command and wait for the reply.
 *
 * Replies can arrive in several packets — `status` on a full server does — so
 * this collects until the server goes quiet rather than returning the first
 * packet and truncating the answer mid-row.
 */
export function sendRcon({ host = "127.0.0.1", port, password, command, timeoutMs = DEFAULT_TIMEOUT_MS, darkplaces = false }) {
  return new Promise((resolve, reject) => {
    if (!port) return reject(new Error("rcon requires a port"));
    if (!password) return reject(new Error("rcon requires a password"));
    if (!command || typeof command !== "string") return reject(new Error("rcon requires a command"));
    if (/[\r\n\0]/.test(command)) return reject(new Error("rcon command contains a line break"));

    const socket = dgram.createSocket("udp4");
    const chunks = [];
    let settleTimer = null;
    let done = false;

    const finish = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      if (settleTimer) clearTimeout(settleTimer);
      try {
        socket.close();
      } catch {
        /* already closing */
      }
      if (err) reject(err);
      else resolve(value);
    };

    const hardTimer = setTimeout(() => {
      if (chunks.length) finish(null, chunks.join(""));
      else finish(new Error("rcon timed out"));
    }, timeoutMs);

    socket.on("error", (err) => finish(err));

    socket.on("message", (msg) => {
      let body = msg;
      if (body.length >= 4 && body.subarray(0, 4).equals(HEADER)) body = body.subarray(4);
      let text = body.toString("utf8");
      // Servers answer "print\n<text>"; the marker is not part of the answer.
      if (darkplaces && text.startsWith("n")) text = text.slice(1);
      else if (text.startsWith("print\n")) text = text.slice(6);
      else if (text.startsWith("print")) text = text.slice(5);
      chunks.push(text);
      // Another packet may still be in flight. Settle briefly before answering.
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => finish(null, chunks.join("")), 250);
    });

    const packet = Buffer.concat([HEADER, Buffer.from(`rcon ${password} ${command}`, "utf8")]);
    socket.send(packet, port, host, (err) => {
      if (err) finish(err);
    });
  });
}

/**
 * True when the reply says the password was wrong.
 *
 * Worth naming: a bad password answers with a normal-looking print rather than
 * an error, so a caller checking only for a thrown exception would report a
 * rejected command as a successful one.
 */
export function isRconAuthFailure(response) {
  return /bad rconpassword|no rconpassword set/i.test(String(response || ""));
}

/*
 * Source RCON (Team Fortress 2, Counter-Strike 2).
 *
 * TCP on the game port. Every packet is little-endian
 * [size][id][type][body\0][\0]; size counts everything after itself.
 *   auth:   type 3 with the password  -> reply type 2 echoing our id (-1 = refused)
 *   exec:   type 2 with the command   -> one or more type 0 replies
 * A long reply is split over several packets with no end marker, so, as with
 * the UDP flavour, the reply is whatever arrives before the socket goes quiet.
 */

function sourcePacket(id, type, body) {
  const text = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(14 + text.length);
  buf.writeInt32LE(10 + text.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  text.copy(buf, 12);
  return buf;
}

export function sendSourceRcon({ host = "127.0.0.1", port, password, command, timeoutMs = 4000 }) {
  return new Promise((resolve, reject) => {
    if (!port) return reject(new Error("rcon requires a port"));
    if (!password) return reject(new Error("rcon requires a password"));
    if (!command || typeof command !== "string" || /[\r\n\0]/.test(command)) return reject(new Error("rcon requires a single-line command"));
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let authed = false;
    let out = "";
    let done = false;
    let settle = null;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(hard);
      if (settle) clearTimeout(settle);
      socket.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    const hard = setTimeout(() => (authed ? finish(null, out) : finish(new Error("rcon timed out"))), timeoutMs);
    socket.on("error", (err) => finish(err));
    socket.on("connect", () => socket.write(sourcePacket(1, 3, password)));
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < size + 4) break;
        const id = buffer.readInt32LE(4);
        const type = buffer.readInt32LE(8);
        const body = buffer.subarray(12, 4 + size - 2).toString("utf8");
        buffer = buffer.subarray(size + 4);
        if (!authed) {
          if (type !== 2) continue; // an empty type-0 packet precedes the auth answer
          if (id === -1) return finish(new Error("Bad rconpassword"));
          authed = true;
          socket.write(sourcePacket(2, 2, command));
          settle = setTimeout(() => finish(null, out), 700);
          continue;
        }
        if (type === 0) {
          out += body;
          if (settle) clearTimeout(settle);
          settle = setTimeout(() => finish(null, out), 250);
        }
      }
    });
  });
}

/**
 * Run a command on a room over whichever control channel its recipe declares.
 * DarkPlaces (Xonotic) speaks the Quake 3 packet format with rcon_secure 0 but
 * answers with an "n" header instead of "print".
 */
export async function sendRoomRcon(room, command) {
  if (room.rcon === "source") {
    return sendSourceRcon({ port: room.port, password: room.rconPassword, command });
  }
  return sendRcon({ port: room.port, password: room.rconPassword, command, darkplaces: room.rcon === "darkplaces" });
}
