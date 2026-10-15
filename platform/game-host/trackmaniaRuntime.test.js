import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepareTrackmaniaPackage } from "./trackmaniaRuntime.js";

test("private Trackmania refresh replaces only engine/Packs and preserves newer maps and secrets", {skip:process.platform!=="linux"}, t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-trackmania-package-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const shared=path.join(root,"shared"),runtime=path.join(root,"private");
  fs.mkdirSync(path.join(shared,"runtime/Packs"),{recursive:true});fs.writeFileSync(path.join(shared,"runtime/TrackmaniaServer"),"old");fs.writeFileSync(path.join(shared,"runtime/Packs/data"),"old");
  fs.mkdirSync(path.join(runtime,"UserData"),{recursive:true});fs.mkdirSync(path.join(runtime,"Packs"));fs.writeFileSync(path.join(runtime,"UserData/config"),"private credentials");fs.writeFileSync(path.join(runtime,"UserData/map"),"saved map");
  const verifyTree=folder=>({buildId:fs.readFileSync(path.join(folder,"TrackmaniaServer"),"utf8")});const options={verifyInstalled:()=>verifyTree(path.join(shared,"runtime")),verifyTree};
  prepareTrackmaniaPackage(shared,runtime,options);assert.equal(fs.readFileSync(path.join(runtime,"Packs/data"),"utf8"),"old");
  fs.writeFileSync(path.join(shared,"runtime/TrackmaniaServer"),"new");fs.writeFileSync(path.join(shared,"runtime/Packs/data"),"new");fs.writeFileSync(path.join(runtime,"UserData/map"),"newer map");
  const engine=prepareTrackmaniaPackage(shared,runtime,options);assert.equal(fs.readFileSync(engine,"utf8"),"new");assert.equal(fs.readFileSync(path.join(runtime,"Packs/data"),"utf8"),"new");assert.equal(fs.readFileSync(path.join(runtime,"UserData/map"),"utf8"),"newer map");assert.equal(fs.readFileSync(path.join(runtime,"UserData/config"),"utf8"),"private credentials");
  fs.writeFileSync(path.join(shared,"runtime/TrackmaniaServer"),"old");prepareTrackmaniaPackage(shared,runtime,options);assert.equal(fs.readFileSync(path.join(runtime,"UserData/map"),"utf8"),"newer map");
});
