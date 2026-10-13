import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { anivDirectory, anivStatus, waitForAniv, queryAnivOccupancy } from "./anivControl.js";

test("ANEURISM identities are stable and never become caller-supplied paths", () => {
  assert.equal(anivDirectory("server-one"), anivDirectory("server-one"));
  assert.notEqual(anivDirectory("prefixA-shared-tail-12345678901234567890"), anivDirectory("prefixB-shared-tail-12345678901234567890"));
  assert.throws(()=>anivDirectory("../../secrets"));
});
test("ANEURISM readiness requires fresh status owned by the same supervisor", async () => {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),"pb-aniv-"));
  const room={cwd,pid:123};
  const file=path.join(cwd,"aniv-status.json");
  const write=patch=>fs.writeFileSync(file,JSON.stringify({pid:123,updatedAt:Date.now(),ready:true,steamServerId:"85568392936848198",...patch}));
  write({}); assert.equal(anivStatus(room).ready,true);
  assert.equal(await waitForAniv(room,{exitCode:null,signalCode:null},20),true);
  write({pid:124}); assert.equal(anivStatus(room),null);
  assert.equal(await queryAnivOccupancy(room),null);
  write({updatedAt:Date.now()-9000}); assert.equal(anivStatus(room),null);
  assert.equal(await queryAnivOccupancy(room),null);
  write({error:"Token already assigned"}); assert.equal(await waitForAniv(room,{exitCode:null,signalCode:null},20),false);
  assert.equal(await waitForAniv(room,{exitCode:1,signalCode:null},20),false);
});
