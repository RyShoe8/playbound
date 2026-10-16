import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHxIni, hxReady, prepareHxRoom, hxRoomDir } from "./deusExHx.js";

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
  assert.throws(()=>hxRoomDir({communityServerId:'../different-room'}),/valid party/);
  assert.equal(hxReady("/nonexistent/playbound/deus-ex"), false);
  assert.throws(
    () => prepareHxRoom(7790, { partyId: "test" }, "/nonexistent/playbound/deus-ex"),
    /provisioned Deus Ex GOTY/
  );
});

test("HX rooms have private saves and never change another room or installed saves",{skip:process.platform!=="linux"},t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-hx-save-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const base=path.join(root,'game'),home=path.join(root,'home');
  for (const name of ['System','Maps','Save'])fs.mkdirSync(path.join(base,name),{recursive:true});
  for (const name of ['run-server','System/HCC.exe','System/HX.u','System/DeusEx.u','System/HXDefault.ini','Maps/01_NYC_UNATCOIsland.dx'])fs.writeFileSync(path.join(base,name),'fixture');
  fs.writeFileSync(path.join(base,'Save/shared'),'original save');
  const a=prepareHxRoom(7790,{communityServerId:'a'},base,home,{refresh:()=>{}}),b=prepareHxRoom(7793,{communityServerId:'b'},base,home,{refresh:()=>{}});
  fs.appendFileSync(path.join(a,'System/HX.ini'),'\r\n[PrivateRules]\r\nCustomValue=retained\r\n');
  prepareHxRoom(7796,{communityServerId:'a',maxPlayers:3},base,home,{refresh:()=>{}});
  const retained=fs.readFileSync(path.join(a,'System/HX.ini'),'utf8');assert.match(retained,/CustomValue=retained/);assert.match(retained,/Port=7796/);assert.match(retained,/MaxPlayers=3/);
  fs.writeFileSync(path.join(a,'Save/private'),'a save');assert.deepEqual(fs.readdirSync(path.join(b,'Save')),[]);assert.equal(fs.readFileSync(path.join(base,'Save/shared'),'utf8'),'original save');
  fs.rmSync(path.join(b,'Save'),{recursive:true});fs.symlinkSync(path.join(base,'Save'),path.join(b,'Save'));
  assert.throws(()=>prepareHxRoom(7793,{communityServerId:'b'},base,home,{refresh:()=>{}}),/legacy shared saves/);
  assert.equal(fs.readFileSync(path.join(base,'Save/shared'),'utf8'),'original save');
});
