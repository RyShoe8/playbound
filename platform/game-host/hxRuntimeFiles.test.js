import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { refreshHxRuntime } from "./hxRuntimeFiles.js";

const digest = value => createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-hx-refresh-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const base=path.join(root,"base"),room=path.join(root,"room");
  fs.mkdirSync(base);fs.mkdirSync(room);
  return {base,room};
}

test("HX refresh replaces only reviewed prior binaries and preserves private rules",t=>{
  const {base,room}=fixture(t);
  fs.writeFileSync(path.join(base,"HX.u"),"new");
  fs.writeFileSync(path.join(room,"HX.u"),"old");
  fs.writeFileSync(path.join(room,"HX.ini"),"private rules");
  fs.writeFileSync(path.join(room,"HXUser.ini"),"private user rules");
  const options={files:{"HX.u":digest("new")},previous:[{"HX.u":digest("old")}]};
  assert.equal(refreshHxRuntime(base,room,options),1);
  assert.equal(refreshHxRuntime(base,room,options),0);
  assert.equal(fs.readFileSync(path.join(room,"HX.u"),"utf8"),"new");
  assert.equal(fs.readFileSync(path.join(room,"HX.ini"),"utf8"),"private rules");
  assert.equal(fs.readFileSync(path.join(room,"HXUser.ini"),"utf8"),"private user rules");
});

test("HX preflight rejects unknown private files before replacing any binary",t=>{
  const {base,room}=fixture(t);
  for(const name of ["HX.u","HCC.exe"])fs.writeFileSync(path.join(base,name),"new");
  fs.writeFileSync(path.join(room,"HX.u"),"old");
  fs.writeFileSync(path.join(room,"HCC.exe"),"custom");
  assert.throws(()=>refreshHxRuntime(base,room,{files:{"HX.u":digest("new"),"HCC.exe":digest("new")},previous:[{"HX.u":digest("old")}]}),/modified/);
  assert.equal(fs.readFileSync(path.join(room,"HX.u"),"utf8"),"old");
});

test("HX source checksum and configuration-path substitutions fail closed",t=>{
  const {base,room}=fixture(t);
  fs.writeFileSync(path.join(base,"HX.u"),"changed");
  assert.throws(()=>refreshHxRuntime(base,room,{files:{"HX.u":digest("reviewed")}}),/installed runtime/);
  assert.throws(()=>refreshHxRuntime(base,room,{files:{"HX.ini":digest("changed")}}),/profile/);
  assert.deepEqual(fs.readdirSync(room),[]);
});

test("HX refresh rejects private symlink destinations",{skip:process.platform!=="linux"},t=>{
  const {base,room}=fixture(t);
  fs.writeFileSync(path.join(base,"HX.u"),"new");
  fs.symlinkSync(path.join(base,"HX.u"),path.join(room,"HX.u"));
  assert.throws(()=>refreshHxRuntime(base,room,{files:{"HX.u":digest("new")}}),/requires review/);
});
