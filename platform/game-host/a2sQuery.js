import dgram from "node:dgram";

const INFO_REQUEST = Buffer.concat([Buffer.from([255, 255, 255, 255, 84]), Buffer.from("Source Engine Query\0")]);

export function parseA2sOccupancy(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 18 || packet.readInt32LE(0) !== -1 || packet[4] !== 0x49) return null;
  let offset = 6; // response type and protocol version
  for (let i = 0; i < 4; i++) {
    const end = packet.indexOf(0, offset);
    if (end < 0) return null;
    offset = end + 1;
  }
  // App ID, total players, max players, then bots. Report human players only.
  if (offset + 5 > packet.length) return null;
  if (packet.readUInt16LE(offset) !== 730) return null; // Counter-Strike 2
  const total = packet[offset + 2];
  const bots = packet[offset + 4];
  if (bots > total) return null;
  return { players: total - bots, maxPlayers: packet[offset + 3] };
}

export function parseA2sInfo(packet) {
  return parseA2sOccupancy(packet)?.players ?? null;
}

export async function queryA2sOccupancy(port) {
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
        socket.send(Buffer.concat([INFO_REQUEST, packet.subarray(5, 9)]), port, "127.0.0.1", (error) => {
          if (error) finish(null);
        });
        return;
      }
      finish(parseA2sOccupancy(packet));
    });
    socket.send(INFO_REQUEST, port, "127.0.0.1", (error) => {
      if (error) finish(null);
    });
  });
}

export async function queryA2sPlayers(port) {
  return (await queryA2sOccupancy(port))?.players ?? null;
}
