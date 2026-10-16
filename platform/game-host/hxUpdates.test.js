import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyHxInstallation, stageHxRelease } from "./hxUpdates.js";
import { installationKey, installationDependencies, INSTALLATION_TARGETS } from "./installationTargets.js";
import { automaticInstallationUpdate, latestInstallationBuild } from "./dailyInstallationUpdates.js";

test("HX has its own System update boundary and canonical game dependency",()=>{
  assert.equal(installationKey("deus-ex-goty-edition"),"deus-ex");
  assert.deepEqual(installationDependencies("deus-ex-goty-edition"),["deus-ex"]);
  assert.equal(INSTALLATION_TARGETS["deus-ex"].component,"System");
  assert.equal(automaticInstallationUpdate("deus-ex"),true);
});
test("HX daily discovery compares numeric versions only on the publisher channel",async()=>{
  const request=async url=>{
    assert.equal(url,"https://builds.hx.hanfling.de/testing/");
    return new Response('<a href="HX-0.9.89.4.zip">old</a><a href="HX-0.9.100.1.zip">new</a>');
  };
  assert.equal(await latestInstallationBuild("deus-ex",{request}),"0.9.100.1");
  await assert.rejects(latestInstallationBuild("deus-ex",{request:async()=>new Response("no releases")}),/metadata unavailable/);
});
test("HX missing or changed packages cannot queue a staging download",async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-hx-package-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,"System"));
  fs.writeFileSync(path.join(root,"System/HCC.exe"),"unreviewed");
  assert.throws(()=>verifyHxInstallation(root),/reviewed release/);
  await assert.rejects(stageHxRelease(root,{request:()=>{throw Error("must not download")}}),/isolated staging/);
});
