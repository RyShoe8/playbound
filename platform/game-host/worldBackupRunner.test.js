import test from "node:test";
import assert from "node:assert/strict";
import { runIsolatedWorldBackup } from "./worldBackupRunner.js";

const id = "0123456789abcdef01234567";
const token = "01234567-0123-4123-8123-0123456789ab";

test("every verified native identity uses the protected snapshot helper",async()=>{
  for (const game of ["teeworlds","bzflag","hedgewars","openttd","luanti","openarena","battle-for-wesnoth"]) {
    const result=await runIsolatedWorldBackup("createWorldBackup",[id,game],async(binary,args)=>{
      assert.equal(binary,"/usr/bin/sudo");
      assert.deepEqual(args,["-n","/usr/local/libexec/playbound-customer-world-backups","create",id,"3"]);
      return {stdout:JSON.stringify({gameSlug:game,id:token})};
    });
    assert.equal(result.gameSlug,game);
  }
  await assert.rejects(runIsolatedWorldBackup("createWorldBackup",[id,"supertuxkart"],()=>assert.fail("unverified profile reached helper")));
});

test("isolated snapshots use only the fixed root helper and typed identities", async () => {
  const calls = [];
  const execute = async (binary, args, options) => {
    calls.push({binary,args,options});
    return {stdout: JSON.stringify({gameSlug: "luanti", id: token})};
  };
  await runIsolatedWorldBackup("createWorldBackup", [id,"luanti",4], execute);
  assert.equal(calls[0].binary, "/usr/bin/sudo");
  assert.deepEqual(calls[0].args, ["-n","/usr/local/libexec/playbound-customer-world-backups","create",id,"4"]);
  assert.deepEqual(calls[0].options.env, {PATH:"/usr/bin:/bin",LANG:"C.UTF-8"});
  for (const [fn,args] of [["exec",[id,"luanti"]],["createWorldBackup",["../other","luanti",3]],["createWorldBackup",[id,"unknown",3]],["createWorldBackup",[id,"luanti",51]],["restoreWorldBackup",[id,"luanti","../other",3]]]) {
    await assert.rejects(runIsolatedWorldBackup(fn,args,()=>assert.fail("invalid input reached sudo")));
  }
});

test("isolated snapshot output must match the expected game and never leaks helper errors", async () => {
  await assert.rejects(runIsolatedWorldBackup("listWorldBackups",[id,"luanti"],async()=>({stdout:JSON.stringify([{gameSlug:"openttd"}])})), /Isolated world snapshot failed/);
  await assert.rejects(runIsolatedWorldBackup("createWorldBackup",[id,"luanti"],async()=>{throw Error("private absolute path or credential");}), error => !error.message.includes("credential") && error.message.includes("Stop the server"));
  assert.deepEqual(await runIsolatedWorldBackup("listWorldBackups",[id,"openttd"],async()=>({stdout:"[]"})),[]);
});
