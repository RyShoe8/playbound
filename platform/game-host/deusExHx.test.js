import assert from "node:assert/strict";
import test from "node:test";
import { buildHxIni, hxReady, prepareHxRoom } from "./deusExHx.js";

test("HX room INI changes the gameplay port and player cap without publishing the party", () => {
  const template = "[URL]\r\nPort=7790\r\n[Engine.GameInfo]\r\nMaxPlayers=8\r\n[IpDrv.TcpNetDriver]\r\nAllowDownloads=True\r\n[HX.HXUdpServerUplink]\r\nDoUplink=True\r\n";
  const ini = buildHxIni(template, 7793, 5);
  assert.match(ini, /\[URL\]\r\nPort=7793/);
  assert.match(ini, /\[Engine.GameInfo\]\r\nMaxPlayers=5/);
  assert.match(ini, /\[IpDrv.TcpNetDriver\]\r\nAllowDownloads=False/);
  assert.match(ini, /\[HX.HXUdpServerUplink\]\r\nDoUplink=False/);
  assert.equal((ini.match(/Port=/g) || []).length, 1);
  assert.equal((ini.match(/MaxPlayers=/g) || []).length, 1);
});

test("an unprovisioned commercial game cannot be prepared", () => {
  assert.equal(hxReady("/nonexistent/playbound/deus-ex"), false);
  assert.throws(
    () => prepareHxRoom(7790, { partyId: "test" }, "/nonexistent/playbound/deus-ex"),
    /provisioned Deus Ex GOTY/
  );
});
