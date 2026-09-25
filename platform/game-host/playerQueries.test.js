import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuake3Status, parseMindustryPing, parseAssaultCubeInfo, LOCAL_QUERY_GAMES } from "./playerQueries.js";
import { parseA2sOccupancy } from "./a2sQuery.js";

const ff = Buffer.from([0xff, 0xff, 0xff, 0xff]);

test("Quake 3 status counts players with a ping and ignores bots (ping 0)", () => {
  const body = 'statusResponse\n\\sv_hostname\\PB\\sv_maxclients\\16\n12 48 "Alice"\n3 0 "Bot"\n0 71 "Bob"\n';
  assert.deepEqual(parseQuake3Status(Buffer.concat([ff, Buffer.from(body)])), { players: 2, maxPlayers: 16, bots: 1 });
});

test("MOHAA status replies carry a 0x01 direction byte", () => {
  const body = 'statusResponse\n\\sv_maxclients\\16\\g_gametype\\1\n';
  assert.deepEqual(parseQuake3Status(Buffer.concat([ff, Buffer.from([0x01]), Buffer.from(body)])), { players: 0, maxPlayers: 16, bots: 0 });
});

test("non-status packets are unknown, not empty", () => {
  assert.equal(parseQuake3Status(Buffer.concat([ff, Buffer.from("infoResponse\n\\clients\\0\n")])), null);
  assert.equal(parseQuake3Status(Buffer.from("garbage")), null);
});

test("Mindustry ping: players and limit", () => {
  const str = (s) => Buffer.concat([Buffer.from([Buffer.byteLength(s)]), Buffer.from(s)]);
  const int = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
  const packet = Buffer.concat([str("PB"), str("Ancient Caldera"), int(3), int(12), int(146), str("official"), Buffer.from([0]), int(30)]);
  assert.deepEqual(parseMindustryPing(packet), { players: 3, maxPlayers: 30 });
});

test("AssaultCube info: numclients and maxclients", () => {
  const packet = Buffer.concat([
    Buffer.from([5, 0x80, 0xa9, 0x04, 2, 1, 15]), // millis 5, protocol 1193 (0x80 + int16), mode 2, clients 1, minutes 15
    Buffer.from("ac_desert\0PlayBound\0"),
    Buffer.from([16]),
  ]);
  assert.deepEqual(parseAssaultCubeInfo(packet), { players: 1, maxPlayers: 16 });
});

test("A2S accepts any app when asked (TF2 reports 440, not CS2's 730)", () => {
  const packet = Buffer.from(
    "ffffffff49115042006374665f32666f7274007466005465616d20466f72747265737300b801001800646c00",
    "hex"
  );
  assert.equal(parseA2sOccupancy(packet), null);
  assert.deepEqual(parseA2sOccupancy(packet, null), { players: 0, maxPlayers: 24, bots: 0 });
});

test("every queryable game is declared", () => {
  for (const slug of ["counter-strike-2", "team-fortress-2", "xonotic", "openarena", "wolfenstein-enemy-territory",
    "unvanquished", "medal-of-honor-allied-assault", "mindustry", "assaultcube", "space-station-14", "morrowind"]) {
    assert.ok(LOCAL_QUERY_GAMES.has(slug), slug);
  }
});

import {
  parseOpenTtdGameInfo, parseBzflagQueryGame, parseVelorenMetrics, parseStkDiscovery,
  parseFgmsStatus, parseBombSquadResponse, countEstablishedTcp, zandronumDecode, parseZandronumReply,
} from "./playerQueries.js";

test("OpenTTD game info (captured from the VPS, 13.4)", () => {
  const packet = Buffer.from("3400060601ffffffff000024de0a001fde0a000f0019556e6e616d6564205365727665720031332e340000190000000100010001", "hex");
  assert.deepEqual(parseOpenTtdGameInfo(packet), { players: 0, maxPlayers: 25 });
});

test("BZFlag MsgQueryGame sums the six team sizes", () => {
  const reply = Buffer.from("425a46533032323100002c71670002003a000800010001000200000000000000030008000800080008000800c8000000000000000000000000", "hex");
  assert.deepEqual(parseBzflagQueryGame(reply), { players: 6, maxPlayers: 8 });
});

test("Veloren metrics", () => {
  assert.equal(parseVelorenMetrics("clients_connected 4\nplayers_connected 3\n"), 3);
  assert.equal(parseVelorenMetrics("nothing here"), null);
});

test("SuperTuxKart discovery only counts when the port is this room's", () => {
  const m = Buffer.from("000000060d5042207175657279207465737408020ada0003000000", "hex");
  assert.deepEqual(parseStkDiscovery(m, 2778), { players: 2, maxPlayers: 8 });
  assert.equal(parseStkDiscovery(m, 2760), null);
});

test("fgms telnet status", () => {
  assert.deepEqual(parseFgmsStatus("# This is fgms\n# 3 pilot(s) online\n"), { players: 3, maxPlayers: null });
});

test("BombSquad host query V2: the host counts itself", () => {
  const m = Buffer.concat([Buffer.from([39, 1, 2, 3, 4]), Buffer.from('{"n":"PB","sz":3,"szx":9}')]);
  assert.deepEqual(parseBombSquadResponse(m), { players: 2, maxPlayers: 8 });
});

test("TCP client count requires a listener and ignores loopback", () => {
  const hdr = "  sl  local_address rem_address   st\n";
  const listening = hdr + "0: 00000000:0834 00000000:0000 0A\n1: 5D8593E1:0834 0A0B0C0D:D431 01\n2: 5D8593E1:0834 0100007F:D432 01\n";
  assert.equal(countEstablishedTcp([listening], 2100), 1);
  assert.equal(countEstablishedTcp([hdr + "1: 5D8593E1:0834 0A0B0C0D:D431 01\n"], 2100), null);
});

test("Zandronum: raw (0xFF) replies decode and parse", () => {
  const body = Buffer.alloc(4 + 4 + 5 + 4 + 2);
  body.writeInt32LE(5660023, 0);
  body.writeInt32LE(1, 4);
  Buffer.from("3.2\0").copy(body, 8);
  body.writeInt32LE(0x20 | 0x80000, 12);
  body[16] = 32; body[17] = 3;
  const decoded = zandronumDecode(Buffer.concat([Buffer.from([0xff]), body]));
  assert.deepEqual(parseZandronumReply(decoded), { players: 3, maxPlayers: 32 });
});
