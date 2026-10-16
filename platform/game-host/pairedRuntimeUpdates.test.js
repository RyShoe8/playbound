import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { enrollPairedRuntime, verifyPairedTree, stagePairedRuntime, recordPairedVerification, inspectPairedInstallation } from "./pairedRuntimeUpdates.js";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-paired-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,"assets"));fs.mkdirSync(path.join(root,"userdata"));fs.writeFileSync(path.join(root,"userdata/world"),"saved world");fs.writeFileSync(path.join(root,"assets/data"),"matching assets");
  const binary=Buffer.alloc(32);binary.write("\x7fELF");binary[4]=2;binary[5]=1;binary.writeUInt16LE(62,18);fs.writeFileSync(path.join(root,"veloren-server-cli"),binary,{mode:0o755});
  const hash=createHash("sha256");for(const [name,data] of [["assets/data",Buffer.from("matching assets")],["veloren-server-cli",binary]]) hash.update(name+"\0"+sha(data)+"\n");
  return {root,profile:{latest:"new",binaries:["veloren-server-cli"],versions:[{buildId:"old",treeSha256:hash.digest("hex"),fileCount:2,totalBytes:47}]}};
}
test("enrollment is idempotent, copies the engine and assets together, and leaves worlds outside rollback",t=>{
  const f=fixture(t);assert.equal(enrollPairedRuntime(f.root,"veloren",{profile:f.profile}).buildId,"old");
  assert.equal(enrollPairedRuntime(f.root,"veloren",{profile:f.profile}).buildId,"old");assert.ok(!fs.existsSync(path.join(f.root,"runtime/userdata")));
  assert.equal(fs.readFileSync(path.join(f.root,"userdata/world"),"utf8"),"saved world");
});

test("inventory reads verified runtime identity without rehashing assets, and refuses changed engines", t => {
  const f = fixture(t), options = { profile: f.profile };
  const verified = enrollPairedRuntime(f.root, "veloren", options);
  recordPairedVerification(f.root, "veloren", verified, options);
  assert.equal(inspectPairedInstallation(f.root, "veloren", options).buildId, "old");
  fs.writeFileSync(path.join(f.root, "userdata/world"), "newer private world");
  assert.equal(inspectPairedInstallation(f.root, "veloren", options).buildId, "old");
  fs.appendFileSync(path.join(f.root, "runtime/veloren-server-cli"), "changed");
  assert.throws(() => inspectPairedInstallation(f.root, "veloren", options), /engine changed/);
});

test("32-bit SDK profiles require their reviewed architecture", t => {
  const f = fixture(t), filename = path.join(f.root, "veloren-server-cli");
  const bytes = fs.readFileSync(filename); bytes[4] = 1; bytes.writeUInt16LE(3, 18);
  fs.writeFileSync(filename, bytes);
  const hash = createHash("sha256");
  for (const [name, data] of [["assets/data", Buffer.from("matching assets")], ["veloren-server-cli", bytes]]) hash.update(name + "\0" + sha(data) + "\n");
  // This fixture deliberately excludes mutable userdata from the package.
  const root = path.join(f.root, "package"); fs.mkdirSync(root);
  fs.renameSync(path.join(f.root, "assets"), path.join(root, "assets")); fs.renameSync(filename, path.join(root, "veloren-server-cli"));
  const profile = { ...f.profile, elfClass: 1, versions: [{ ...f.profile.versions[0], treeSha256: hash.digest("hex") }] };
  assert.equal(verifyPairedTree(root, "open-fortress", { profile }).buildId, "old");
  assert.throws(() => verifyPairedTree(root, "open-fortress", { profile: { ...profile, elfClass: 2 } }), /architecture/);
  assert.throws(() => verifyPairedTree(root, "open-fortress", { profile: { ...profile, elfClass: 0 } }), /architecture/);
});
test("mixed or modified engine/assets and unreviewed extra files fail closed",t=>{
  const f=fixture(t);enrollPairedRuntime(f.root,"veloren",{profile:f.profile});
  fs.writeFileSync(path.join(f.root,"runtime/assets/data"),"different data!");assert.throws(()=>verifyPairedTree(path.join(f.root,"runtime"),"veloren",{profile:f.profile}),/do not match/);
});
test("failed or redirected downloads never replace even the staging runtime",async t=>{
  const f=fixture(t);enrollPairedRuntime(f.root,"veloren",{profile:f.profile});
  const stage=path.join(f.root,`.pb-update-veloren-${randomUUID()}`);fs.mkdirSync(stage);fs.renameSync(path.join(f.root,"runtime"),path.join(stage,"runtime"));
  const verify=()=>({buildId:"old"});const profile={...f.profile,versions:[...f.profile.versions,{buildId:"new",url:"https://github.com/veloren/veloren/releases/download/weekly/fixed.zip",archiveBytes:10,archiveSha256:"0".repeat(64)}]};
  await assert.rejects(stagePairedRuntime(stage,"veloren",{verify,profile,request:async()=>({statusCode:302,headers:{location:"https://evil.test/asset"},stream:Readable.from([])})}),/untrusted/);
  await assert.rejects(stagePairedRuntime(stage,"veloren",{verify,profile,request:async()=>({statusCode:200,stream:Readable.from([Buffer.from("bad")])})}),/checksum/);
  assert.equal(verifyPairedTree(path.join(stage,"runtime"),"veloren",{profile:f.profile}).buildId,"old");
});
test("paired archives reject traversal, symlinks, duplicates and a changed package",{skip:process.platform!=="linux"},()=>{
  execFileSync("/usr/bin/python3",[fileURLToPath(new URL("./pairedRuntimeArchive.test.py",import.meta.url))],{timeout:30000,maxBuffer:8192});
});
test("Veloren keeps userdata outside its package and never falls back to a mismatched legacy engine",async t=>{
  const f=fixture(t), previous=process.env.GAME_HOST_GAMES_DIR;process.env.GAME_HOST_GAMES_DIR=f.root;
  t.after(()=>{if(previous===undefined)delete process.env.GAME_HOST_GAMES_DIR;else process.env.GAME_HOST_GAMES_DIR=previous;});
  fs.mkdirSync(path.join(f.root,"veloren/runtime"),{recursive:true});fs.writeFileSync(path.join(f.root,"veloren/veloren-server-cli"),"legacy");
  const {recipes,resolveRecipe}=await import(new URL(`./recipes.js?paired-test=${randomUUID()}`,import.meta.url));
  assert.equal(resolveRecipe("veloren").binary,null);
  const env=recipes.veloren.spawnEnv();assert.equal(env.VELOREN_USERDATA,path.join(f.root,"veloren/userdata"));assert.equal(env.VELOREN_ASSETS,path.join(f.root,"veloren/runtime/assets"));
  assert.equal(recipes.veloren.shutdownCommand,"shutdown immediate\n");
  await recipes.veloren.prepareSpawn(14004,{managed:true,settings:{maxPlayers:4}});
  const cli=path.join(f.root,"veloren/userdata/server-cli/settings.ron");assert.match(fs.readFileSync(cli,"utf8"),/shutdown_signals:\[SIGTERM\]/);
  fs.writeFileSync(cli,"(web_address:\"127.0.0.1:14999\",)");await recipes.veloren.prepareSpawn(14004,{managed:true,settings:{maxPlayers:4}});assert.equal(fs.readFileSync(cli,"utf8"),'(web_address:"127.0.0.1:14999",)');
});

test("Warzone selects its paired data and refuses a missing managed engine", async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-warzone-recipe-")), previous=process.env.GAME_HOST_GAMES_DIR;process.env.GAME_HOST_GAMES_DIR=root;
  t.after(()=>{fs.rmSync(root,{recursive:true,force:true});if(previous===undefined)delete process.env.GAME_HOST_GAMES_DIR;else process.env.GAME_HOST_GAMES_DIR=previous;});
  fs.mkdirSync(path.join(root,"warzone-2100/runtime"),{recursive:true});fs.writeFileSync(path.join(root,"warzone-2100/run-server"),"legacy");
  const {recipes,resolveRecipe}=await import(new URL(`./recipes.js?warzone-test=${randomUUID()}`,import.meta.url));
  assert.equal(resolveRecipe("warzone-2100").binary,null);
  const args=recipes["warzone-2100"].args(29980,{managed:true,settings:{}});assert.ok(args.includes(`--datadir=${path.join(root,"warzone-2100/runtime/data")}`));
});

test("Freedoom never passes an Odamex client to a Chocolate Doom alias", {skip:process.platform!=="linux"}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-doom-alias-")),previous=process.env.GAME_HOST_GAMES_DIR;process.env.GAME_HOST_GAMES_DIR=root;
  t.after(()=>{fs.rmSync(root,{recursive:true,force:true});if(previous===undefined)delete process.env.GAME_HOST_GAMES_DIR;else process.env.GAME_HOST_GAMES_DIR=previous;});
  fs.mkdirSync(path.join(root,"freedoom"));fs.writeFileSync(path.join(root,"freedoom/chocolate-server"),"wrong protocol",{mode:0o755});fs.symlinkSync("chocolate-server",path.join(root,"freedoom/odasrv"));
  const {recipes}=await import(new URL(`./recipes.js?doom-alias-test=${randomUUID()}`,import.meta.url));
  const selected=recipes.freedoom.resolveBinary([],{editionSlug:"odamex"});assert.notEqual(selected,path.join(root,"freedoom/odasrv"));
});

test("Trackmania permits only fixed bindings to isolated sibling mutable directories",{skip:process.platform!=="linux"},t=>{
  const f=fixture(t);enrollPairedRuntime(f.root,"veloren",{profile:f.profile});const runtime=path.join(f.root,"runtime"),data=path.join(f.root,"UserData");fs.mkdirSync(data);fs.symlinkSync("../UserData",path.join(runtime,"UserData"));
  assert.equal(verifyPairedTree(runtime,"trackmania",{profile:f.profile}).buildId,"old");
  fs.unlinkSync(path.join(runtime,"UserData"));fs.symlinkSync("../../UserData",path.join(runtime,"UserData"));assert.throws(()=>verifyPairedTree(runtime,"trackmania",{profile:f.profile}),/unsafe/);
});

test("an absent OpenRA edition never starts a different installed game's engine", async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-openra-variant-")), previous=process.env.GAME_HOST_GAMES_DIR;
  process.env.GAME_HOST_GAMES_DIR=root;
  t.after(()=>{fs.rmSync(root,{recursive:true,force:true});if(previous===undefined)delete process.env.GAME_HOST_GAMES_DIR;else process.env.GAME_HOST_GAMES_DIR=previous;});
  fs.mkdirSync(path.join(root,"openra"));fs.writeFileSync(path.join(root,"openra/OpenRA.Server"),"official engine");
  const {recipes}=await import(new URL(`./recipes.js?variant-test=${randomUUID()}`,import.meta.url));
  for(const editionSlug of ["combined-arms","openhv","e2140","ra2","tiberian-dawn-hd","crystallized-nexus","unknown-new-edition"])
    for (const mod of [undefined,"ra","cnc"])
      assert.equal(recipes.openra.resolveBinary([],{editionSlug,mod}),null,editionSlug);
  assert.equal(recipes.openra.resolveBinary([],{editionSlug:"official"}),path.join(root,"openra/OpenRA.Server"));
  for(const [edition,key,mod] of [["ra2","romanovs-vengeance","rv"],["crystallized-nexus","crystallized-nexus","cn"],["tiberian-dawn-hd","tiberian-dawn-hd","cnc"]]) {
    fs.mkdirSync(path.join(root,key));fs.writeFileSync(path.join(root,key,"OpenRA.Server"),"matching engine");
    assert.equal(recipes.openra.resolveBinary([],{editionSlug:edition,mod:"ra"}),path.join(root,key,"OpenRA.Server"));
    assert.ok(recipes.openra.args(1234,{editionSlug:edition,mod:"ra"}).includes("Game.Mod="+mod));
  }
});

test("Freedoom never launches Zandronum for an incompatible explicit client edition", async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-doom-edition-")),previous=process.env.GAME_HOST_GAMES_DIR;
  process.env.GAME_HOST_GAMES_DIR=root;
  t.after(()=>{fs.rmSync(root,{recursive:true,force:true});if(previous===undefined)delete process.env.GAME_HOST_GAMES_DIR;else process.env.GAME_HOST_GAMES_DIR=previous;});
  fs.mkdirSync(path.join(root,"freedoom"));fs.writeFileSync(path.join(root,"freedoom/zandronum-server"),"engine");
  const {recipes}=await import(new URL(`./recipes.js?doom-edition-test=${randomUUID()}`,import.meta.url));
  for(const editionSlug of ["gzdoom","dsda-doom","ashes-2063","unknown"])
    assert.equal(recipes.freedoom.resolveBinary([],{editionSlug}),null);
  for(const editionSlug of [undefined,"zandronum"])
    assert.equal(recipes.freedoom.resolveBinary([],{editionSlug}),path.join(root,"freedoom/zandronum-server"));
});

test("Open Fortress never silently starts the ordinary 64-bit TF2 server", async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pb-tf2-edition-")),previous=process.env.GAME_HOST_GAMES_DIR;
  process.env.GAME_HOST_GAMES_DIR=root;
  t.after(()=>{fs.rmSync(root,{recursive:true,force:true});if(previous===undefined)delete process.env.GAME_HOST_GAMES_DIR;else process.env.GAME_HOST_GAMES_DIR=previous;});
  fs.mkdirSync(path.join(root,"team-fortress-2"));fs.writeFileSync(path.join(root,"team-fortress-2/srcds_linux64"),"TF2 engine");
  const {recipes}=await import(new URL(`./recipes.js?tf2-edition-test=${randomUUID()}`,import.meta.url));
  assert.equal(recipes['team-fortress-2'].resolveBinary([],{editionSlug:'open-fortress'}),null);
  assert.equal(recipes['team-fortress-2'].resolveBinary([path.join(root,'team-fortress-2/srcds_linux64')],{}),path.join(root,'team-fortress-2/srcds_linux64'));
});
