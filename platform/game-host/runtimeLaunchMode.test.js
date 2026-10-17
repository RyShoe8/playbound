import test from "node:test";
import assert from "node:assert/strict";
import { runtimeLaunchMode } from "./runtimeLaunchMode.js";
const id="ffffffffffffffffffffffff";
test("isolation wins over every special launcher and rejects missing identity",()=>{
  for(const gameSlug of ["rimworld-together","aneurism-iv","openra","new-engine"]){
    assert.equal(runtimeLaunchMode({isolated:{},communityServerId:id,gameSlug}),"isolated");
    for(const communityServerId of [undefined,"party-id","../other"]){assert.throws(()=>runtimeLaunchMode({isolated:{},communityServerId,gameSlug}));}
  }
});
test("ordinary managed and party launches keep their engine-specific transports",()=>{
  for(const communityServerId of [undefined,id]){
    assert.equal(runtimeLaunchMode({gameSlug:"rimworld-together",communityServerId}),"rimworld");
    assert.equal(runtimeLaunchMode({gameSlug:"aneurism-iv",communityServerId}),"aniv");
    assert.equal(runtimeLaunchMode({gameSlug:"openra",communityServerId}),"standard");
  }
});
