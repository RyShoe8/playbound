import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rimworldSnapshot, sendRimworldCommand } from "./rimworldControl.js";
import { queryRoomOccupancy } from "./playerQueries.js";

test("RimWorld refuses stale or previous-process snapshots instead of reporting empty", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pb-rimworld-"));
  const room = { cwd, pid: 123, port: 25590, gameSlug: "rimworld-together" };
  const write = doc => fs.writeFileSync(path.join(cwd, "playbound-status.json"), JSON.stringify(doc));
  try {
    write({pid:123,updatedAt:Date.now(),maxPlayers:4,players:[{id:"SmFja3k=",name:"Jacky",address:"127.0.0.1"}]});
    assert.deepEqual(await queryRoomOccupancy(room), {players:1,maxPlayers:4,bots:0});
    assert.match(await sendRimworldCommand(room,"status"), /Jacky/);
    write({pid:122,updatedAt:Date.now(),maxPlayers:4,players:[]});
    assert.equal(rimworldSnapshot(room),null);
    write({pid:123,updatedAt:Date.now()-11000,maxPlayers:4,players:[]});
    assert.equal(await queryRoomOccupancy(room),null);
    await assert.rejects(sendRimworldCommand(room,"status"),/stale/);
    await assert.rejects(sendRimworldCommand(room,"list\nresetserver"),/one console command/);
  } finally { fs.rmSync(cwd,{recursive:true,force:true}); }
});
