import dgram from "node:dgram";

const INFO_REQUEST = Buffer.concat([Buffer.from([255, 255, 255, 255, 84]), Buffer.from("Source Engine Query\0")]);

/**
 * `expectedAppId` guards against answering for the wrong server; null accepts
 * any Source game (TF2 reports app 440, CS2 730).
 */
export function parseA2sOccupancy(packet, expectedAppId = 730) {
  if (!Buffer.isBuffer(packet) || packet.length < 18 || packet.readInt32LE(0) !== -1 || packet[4] !== 0x49) return null;
  let offset = 6; // response type and protocol version
  for (let i = 0; i < 4; i++) {
    const end = packet.indexOf(0, offset);
    if (end < 0) return null;
    offset = end + 1;
  }
  // App ID, total players, max players, then bots. Report human players only.
  if (offset + 5 > packet.length) return null;
  if (expectedAppId !== null && packet.readUInt16LE(offset) !== expectedAppId) return null;
  const total = packet[offset + 2];
  const bots = packet[offset + 4];
  if (bots > total) return null;
  return { players: total - bots, maxPlayers: packet[offset + 3] };
}

export function parseA2sInfo(packet) {
  return parseA2sOccupancy(packet)?.players ?? null;
}

/**
 * `host` defaults to loopback; TF2's srcds ignores queries from 127.0.0.1 and
 * only answers on the address it serves, so callers may pass the public IP.
 */
export async function queryA2sOccupancy(port, { anyApp = false, host = "127.0.0.1" } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 2500);
    socket.on("error", () => finish(null));
    socket.on("message", (packet) => {
      if (packet.length >= 9 && packet.readInt32LE(0) === -1 && packet[4] === 0x41) {
        socket.send(Buffer.concat([INFO_REQUEST, packet.subarray(5, 9)]), port, host, (error) => {
          if (error) finish(null);
        });
        return;
      }
      finish(parseA2sOccupancy(packet, anyApp ? null : 730));
    });
    socket.send(INFO_REQUEST, port, host, (error) => {
      if (error) finish(null);
    });
  });
}

export async function queryA2sPlayers(port) {
  return (await queryA2sOccupancy(port))?.players ?? null;
}
