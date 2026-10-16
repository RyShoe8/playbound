import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { prepareGoldenEye } from "./goldenEyeRuntime.js";
import { verifyPairedTree } from "./pairedRuntimeUpdates.js";
const sha=data=>createHash("sha256").update(data).digest("hex");
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-ge-runtime-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const shared=path.join(root,"shared"),home=path.join(root,"home"),runtime=path.join(shared,"runtime");
  for(const name of ["bin","hl2","gesource/maps","gesource/python","defaults/cfg"])fs.mkdirSync(path.join(runtime,name),{recursive:true});
  for(const [name,bytes] of [["srcds.exe","reviewed"],["gesource/gameinfo.txt","game"],["gesource/maps/ge_archives.bsp","map"],["gesource/python/server.py","script"],["defaults/cfg/server.cfg","private default\n"]])fs.writeFileSync(path.join(runtime,name),bytes);
  return {root,shared,home,runtime,options:{verify:()=>({buildId:"fixture"}),launcherDigests:[sha("reviewed")]}};
}
test("GoldenEye private settings survive preparation while assets bind to the replaceable package",{skip:process.platform!=="linux"},t=>{
  const f=fixture(t),ctx={communityServerId:"fixture",name:'Name\n"quoted"',rconPassword:"fixture-only"};
  const first=prepareGoldenEye(f.shared,f.home,ctx,f.options),cfg=path.join(first.runtime,"gesource/cfg/server.cfg");
  fs.appendFileSync(cfg,"mp_timelimit 7\n");
  prepareGoldenEye(f.shared,f.home,ctx,f.options);
  assert.match(fs.readFileSync(cfg,"utf8"),/mp_timelimit 7/);
  assert.equal(fs.realpathSync(path.join(first.runtime,"gesource/maps/ge_archives.bsp")),path.join(f.runtime,"gesource/maps/ge_archives.bsp"));
  assert.ok(!fs.lstatSync(path.join(first.runtime,"gesource/maps/graphs")).isSymbolicLink());
  assert.match(fs.readFileSync(path.join(first.runtime,"gesource/cfg/pb-managed.cfg"),"utf8"),/rcon_password "fixture-only"/);
  assert.equal(fs.readFileSync(path.join(f.runtime,"defaults/cfg/server.cfg"),"utf8"),"private default\n");
});
test("GoldenEye refuses unknown launchers, legacy copies and unsafe identities",{skip:process.platform!=="linux"},t=>{
  const f=fixture(t),ctx={partyId:"fixture"};prepareGoldenEye(f.shared,f.home,ctx,f.options);
  fs.writeFileSync(path.join(f.home,"runtime/srcds.exe"),"custom executable");
  assert.throws(()=>prepareGoldenEye(f.shared,f.home,ctx,f.options),/launcher requires review/);
  fs.mkdirSync(path.join(f.home,"runtime/steamapps"));
  assert.throws(()=>prepareGoldenEye(f.shared,f.home,ctx,f.options),/legacy private copy/);
  assert.throws(()=>prepareGoldenEye(f.shared,f.home,{partyId:"../other"},f.options),/valid server identity/);
});
test("paired packages validate PE32 architecture in addition to the complete fingerprint",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-ge-pe32-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const pe=Buffer.alloc(154);pe.writeUInt16LE(0x5a4d,0);pe.writeUInt32LE(128,60);pe.writeUInt32LE(0x4550,128);pe.writeUInt16LE(0x14c,132);pe.writeUInt16LE(0x10b,152);
  fs.writeFileSync(path.join(root,"srcds.exe"),pe,{mode:0o755});
  const tree=createHash("sha256").update("srcds.exe\0"+sha(pe)+"\n").digest("hex");
  const profile={executableFormat:"pe32",binaries:["srcds.exe"],versions:[{buildId:"reviewed",treeSha256:tree,fileCount:1,totalBytes:pe.length}]};
  assert.equal(verifyPairedTree(root,"goldeneye-source",{profile}).buildId,"reviewed");
  assert.throws(()=>verifyPairedTree(root,"goldeneye-source",{profile:{...profile,executableFormat:undefined}}),/ELF engine/);
});
