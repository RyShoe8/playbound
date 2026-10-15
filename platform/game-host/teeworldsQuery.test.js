import assert from "node:assert/strict";
import { test } from "node:test";
import dgram from "node:dgram";
import { queryTeeworlds, queryRoomOccupancy } from "./playerQueries.js";

const info = (players) => Buffer.concat([
  Buffer.from("inf3"), Buffer.from([1]),
  ...["0.7", "Fixture", "host", "dm1", "dm"].map(text => Buffer.from(text + "\0")),
  Buffer.from([0, 0, players, 4]),
]);

async function server(t, host, spoof = false) {
  const socket = dgram.createSocket("udp4");
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.bind(0, host, resolve); });
  t.after(() => socket.close());
  let fake;
  if (spoof) {
    fake = dgram.createSocket("udp4");
    await new Promise(resolve => fake.bind(0, host, resolve));
    t.after(() => fake.close());
  }
  socket.on("message", (message, peer) => {
    if (message.length > 7 && message[7] === 5) {
      const token = Buffer.alloc(12);
      token[0] = 4;
      token[7] = 5;
      token.fill(0x23, 8);
      if (fake) {
        fake.send(info(0), peer.port, peer.address);
        setTimeout(() => socket.send(token, peer.port, peer.address), 20);
      } else socket.send(token, peer.port, peer.address);
    } else if (message.includes(Buffer.from("gie3"))) socket.send(info(2), peer.port, peer.address);
  });
  return socket.address().port;
}

test("Teeworlds default loopback handshake still reports actual occupancy", async t => {
  assert.deepEqual(await queryTeeworlds(await server(t, "127.0.0.1")), { players: 2, maxPlayers: 4 });
});
test("Teeworlds can query an explicit IPv4 host and ignores a forged empty reply from another port", async t => {
  assert.deepEqual(await queryTeeworlds(await server(t, "127.0.0.1", true), { host: "127.0.0.1" }), { players: 2, maxPlayers: 4 });
});
test("Teeworlds sends both handshake steps to the selected IPv4 address", { skip: process.platform !== "linux" }, async t => {
  assert.deepEqual(await queryTeeworlds(await server(t, "127.0.0.2"), { host: "127.0.0.2" }), { players: 2, maxPlayers: 4 });
});
test("filtered managed rooms require their public host; absent configuration is unknown", async t => {
  const port = await server(t, "127.0.0.1");
  assert.deepEqual(await queryRoomOccupancy({ gameSlug: "teeworlds", port, networkProfile: "public-game-v1", host: "127.0.0.1" }), { players: 2, maxPlayers: 4 });
  assert.equal(await queryRoomOccupancy({ gameSlug: "teeworlds", port, networkProfile: "public-game-v1" }), null);
});
test("Teeworlds rejects invalid endpoints as unknown rather than empty or an exception", async () => {
  for (const port of [0, -1, 65536, NaN, 1.5, "8303"]) assert.equal(await queryTeeworlds(port), null);
  for (const host of ["localhost", "::1", "https://example.com", "127.0.0.1;id", null]) assert.equal(await queryTeeworlds(8303, { host }), null);
});
