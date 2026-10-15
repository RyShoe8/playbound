import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {verifyHurryInstallation,stageHurryRelease} from "./hurryUpdates.js";

test("Hurry Curry accepts only a reviewed patched ELF and checks native dependencies", {skip:process.platform!=="linux"}, t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-hurry-review-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bytes=Buffer.alloc(64);bytes.write("\x7fELF");bytes[4]=2;bytes[5]=1;bytes.writeUInt16LE(62,18);const file=path.join(root,"hurrycurry-server");fs.writeFileSync(file,bytes,{mode:0o755});
  const profile={latest:"commit-reviewed",binary:{bytes:96,sha256:"0".repeat(64)},legacyBinary:{bytes:64,sha256:createHash("sha256").update(bytes).digest("hex")}};
  const command=()=>Buffer.from("libc.so.6 => /lib/libc.so.6");
  assert.equal(verifyHurryInstallation(root,{profile,command}).buildId,"legacy-3.1.2");
  assert.throws(()=>verifyHurryInstallation(root,{profile,command:()=>Buffer.from("libc.so.6 => not found")}),/dependencies/);
  bytes[30]=1;fs.writeFileSync(file,bytes);assert.throws(()=>verifyHurryInstallation(root,{profile,command}),/reviewed/);
});
test("failed source builds leave even the staging engine and game data intact",async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-hurry-stage-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const stage=path.join(root,'.pb-update-hurry-curry-'+randomUUID());fs.mkdirSync(stage);fs.writeFileSync(path.join(stage,"hurrycurry-server"),"engine");fs.mkdirSync(path.join(stage,"data"));fs.writeFileSync(path.join(stage,"data/map"),"map");
  await assert.rejects(stageHurryRelease(stage,{verify:()=>({buildId:"old"}),run:async()=>{throw Error("compiler unavailable")}}),/compiler unavailable/);
  assert.equal(fs.readFileSync(path.join(stage,"hurrycurry-server"),"utf8"),"engine");assert.equal(fs.readFileSync(path.join(stage,"data/map"),"utf8"),"map");
});
