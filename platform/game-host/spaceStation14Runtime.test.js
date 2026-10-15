import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifySpaceStation14Metadata, spaceStation14Paths, prepareSpaceStation14Data } from "./spaceStation14Runtime.js";

function fixture(t) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"pb-ss14-")));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}
test("SS14 requires matching engine/content and installed .NET 10",t=>{
  const root=fixture(t),release={buildId:"a".repeat(40),engineVersion:"289.0.3"};
  fs.writeFileSync(path.join(root,"build.json"),JSON.stringify({version:release.buildId,engine_version:release.engineVersion,fork_id:"wizards",hash:"b".repeat(64)}));
  fs.writeFileSync(path.join(root,"Robust.Server.runtimeconfig.json"),JSON.stringify({runtimeOptions:{tfm:"net10.0",framework:{name:"Microsoft.NETCore.App",version:"10.0.0"}}}));
  const command=()=>"Microsoft.NETCore.App 10.0.12 [/usr/lib/dotnet/shared/Microsoft.NETCore.App]\n";
  assert.doesNotThrow(()=>verifySpaceStation14Metadata(root,release,{command}));
  assert.throws(()=>verifySpaceStation14Metadata(root,{...release,engineVersion:"283.1.3"},{command}),/differs/);
  assert.throws(()=>verifySpaceStation14Metadata(root,release,{command:()=>"Microsoft.NETCore.App 8.0.31 [/usr/lib/dotnet/shared/Microsoft.NETCore.App]"}),/runtime/);
});
test("SS14 customer data is distinct and preparation never replaces existing configuration",t=>{
  const root=fixture(t),games=path.join(root,"games");fs.mkdirSync(games);fs.mkdirSync(path.join(games,"space-station-14"));
  const a=spaceStation14Paths(games,root,{customerOwned:true,communityServerId:"server-a"}),b=spaceStation14Paths(games,root,{customerOwned:true,communityServerId:"server-b"});
  prepareSpaceStation14Data(a,root,true);prepareSpaceStation14Data(b,root,true);assert.notEqual(a.data,b.data);
  fs.writeFileSync(a.config,"private configuration");prepareSpaceStation14Data(a,root,true);assert.equal(fs.readFileSync(a.config,"utf8"),"private configuration");
  assert.throws(()=>spaceStation14Paths(games,root,{customerOwned:true,communityServerId:"../escape"}),/identity/);
});
test("SS14 rejects a symlink data directory before creating nested files",{skip:process.platform!=="linux"},t=>{
  const root=fixture(t),outside=path.join(root,"outside"),home=path.join(root,"space-station-14-servers/pb-a");fs.mkdirSync(outside);fs.mkdirSync(home,{recursive:true});fs.symlinkSync(outside,path.join(home,"data"));
  assert.throws(()=>prepareSpaceStation14Data({home,data:path.join(home,"data"),config:path.join(home,"server_config.toml")},root,true),/directories/);
  assert.deepEqual(fs.readdirSync(outside),[]);
});

test("SS14 recipe binds its status port and sends the configured server name",async()=>{
  const {recipes}=await import('./recipes.js');
  const args=recipes['space-station-14'].args(1215,{name:'Friends Station',settings:{}});
  assert.ok(args.includes('status.bind=*:1215'));
  assert.ok(args.includes('game.hostname=Friends Station'));
  assert.ok(args.includes('--data-dir'));
  assert.equal(recipes['space-station-14'].protocol,'both');
});
