import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rimworldSnapshot, sendRimworldCommand, spawnRimworld } from "./rimworldControl.js";
import { retainCapturedLog, LOG_RETAIN_BYTES } from "./managedLogs.js";
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

test("RimWorld FIFO replies finish before rollover and the process stays attached", { skip: process.platform !== "linux" }, async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pb-rimworld-logs-"));
  const log = path.join(cwd, "playbound-console.log");
  fs.writeFileSync(log, "old\n".repeat(LOG_RETAIN_BYTES / 4) + "old tail\n", { mode: 0o600 });
  const script = `const fs=require('node:fs'); process.stdin.resume(); process.stdin.on('data',()=>{fs.writeFileSync('command-seen','yes');setTimeout(()=>console.log('confirmed reply'),200);});`;
  const child = spawnRimworld(process.execPath, ["-e", script], { cwd, env: { PATH: process.env.PATH } });
  try {
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    const response = sendRimworldCommand({ cwd, roomId: "fixture-room" }, "list");
    const deadline = Date.now() + 2000;
    while (!fs.existsSync(path.join(cwd, "command-seen"))) {
      if (Date.now() > deadline) throw new Error("FIFO command was not delivered");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const retention = retainCapturedLog(log);
    assert.match(await response, /confirmed reply/);
    assert.equal(await retention, true);
    assert.equal(child.exitCode, null);
    assert.equal(fs.statSync(log).size, 0);
  } finally {
    child.kill("SIGTERM");
    await new Promise(resolve => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once("exit", resolve); });
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
