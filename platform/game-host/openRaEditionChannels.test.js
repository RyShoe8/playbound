import test from "node:test";
import assert from "node:assert/strict";
import {readRelease} from "./githubReleaseAssets.js";
import {latestInstallationBuild} from "./dailyInstallationUpdates.js";
import {createOpenRaAppImageUpdater} from "./openRaAppImageUpdates.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";

test("Crystallized Nexus selects the game channel rather than the latest launcher",async()=>{
  const request=async url=>{
    assert.equal(url,"https://api.github.com/repos/DoGyAUT/crystallized-nexus/releases?per_page=30");
    return Response.json([
      {tag_name:"launcher-v2.0.0",draft:false,prerelease:false,assets:[{name:"CNLauncher-linux-x64"}]},
      {tag_name:"playtest-20260820",draft:false,prerelease:true,assets:[{name:"CrystallizedNexus-playtest-20260820-x86_64.AppImage"}]},
      {tag_name:"playtest-20270101",draft:true,prerelease:true,assets:[{name:"CrystallizedNexus-playtest-20270101-x86_64.AppImage"}]},
    ]);
  };
  assert.equal((await readRelease("DoGyAUT/crystallized-nexus",{request})).tag_name,"playtest-20260820");
  assert.equal(await latestInstallationBuild("crystallized-nexus",{request}),"playtest-20260820");
});

test("the legacy digest fallback is restricted to its exact reviewed release and bytes",async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-edition-channel-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const stage=path.join(root,".pb-update-openhv-"+randomUUID());fs.mkdirSync(stage);
  const image=Buffer.alloc(512);image.writeUInt32BE(0x7f454c46);image[4]=2;image[5]=1;image.writeUInt16LE(62,18);image.write("hsqs",256);image.writeUInt32LE(131072,268);image.writeUInt16LE(4,284);image.writeBigUInt64LE(256n,296);
  const digest="sha256:"+createHash("sha256").update(image).digest("hex");
  const profile={label:"Fixture",key:"openhv",binary:"OpenHV.Server",marker:".pb-fixture.json",repository:"OpenHV/OpenHV",assetPrefix:"OpenHV",archiveRoot:"usr/lib/openhv",mod:"hv",tag:/^20300101$/,engine:/^reviewed-engine$/,legacy:{buildId:"20300101",size:image.length,digest}};
  const updater=createOpenRaAppImageUpdater(profile);
  fs.writeFileSync(path.join(stage,"OpenHV.Server"),image,{mode:0o755});
  const options={request:async url=>url.startsWith("https://api.github.com/")?Response.json({tag_name:"20300101",draft:false,prerelease:false,assets:[{name:"OpenHV-20300101-x86_64.AppImage",size:512,digest:null,browser_download_url:"https://github.com/OpenHV/OpenHV/releases/download/20300101/OpenHV-20300101-x86_64.AppImage"}]}):new Response(image),run:async(_cmd,args)=>args.at(-1).endsWith("VERSION")?"reviewed-engine":"Metadata:\n\tVersion: 20300101\n"};
  assert.equal((await updater.stageRelease(stage,options)).buildId,"20300101");
  const bad=createOpenRaAppImageUpdater({...profile,legacy:{...profile.legacy,size:1024}});
  await assert.rejects(bad.stageRelease(stage,options),/size changed/);
});
