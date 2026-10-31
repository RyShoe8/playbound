import test from "node:test";
import assert from "node:assert/strict";
import { sendRoomRcon } from "./rcon.js";

const room = { gameSlug:"openarena",rcon:"quake3",port:27980,rconPassword:"fixture-only" };
test("silent OpenArena bot assignment is verified without replaying the write", async () => {
  const commands = [];
  const udp = async ({command}) => {
    commands.push(command);
    if (commands.length === 1) throw Error("rcon timed out");
    return '"bot_minplayers" is:"0^7", the default\n';
  };
  assert.equal(await sendRoomRcon(room,'set bot_minplayers "0"',{udp}),"bot_minplayers verified: 0");
  assert.deepEqual(commands,['set bot_minplayers "0"',"bot_minplayers"]);
});

test("lost or wrong readback cannot confirm a bot change", async () => {
  for (const response of ['"bot_minplayers" is:"2^7"','Bad rconpassword.','']) {
    let count=0;
    await assert.rejects(sendRoomRcon(room,'set bot_minplayers "0"',{udp:async()=>{
      if (++count===1) throw Error("rcon timed out");
      return response;
    }}),/did not confirm/);
    assert.equal(count,2);
  }
});

test("other commands, engines and authentication failures are not retried", async () => {
  for (const [target,command,message] of [[room,"map oa_dm2","rcon timed out"],
    [{...room,gameSlug:"xonotic"},'set bot_minplayers "0"',"rcon timed out"],
    [room,'set bot_minplayers "0"',"Bad rconpassword"],
    [room,'set bot_minplayers "0"; quit',"rcon timed out"]]) {
    let count=0;
    await assert.rejects(sendRoomRcon(target,command,{udp:async()=>{count++;throw Error(message);}}));
    assert.equal(count,1);
  }
});

test("a timeout just after start is reported as still loading, later ones are real failures", async () => {
  const { rconStillLoading, RCON_STARTUP_GRACE_MS } = await import("./rcon.js");
  const room = { createdAt: 1_000_000 };
  assert.equal(rconStillLoading(room, new Error("rcon timed out"), 1_000_000 + 14_000), true);
  assert.equal(rconStillLoading(room, new Error("rcon timed out"), 1_000_000 + RCON_STARTUP_GRACE_MS + 1), false);
  assert.equal(rconStillLoading(room, new Error("Bad password"), 1_000_000 + 1_000), false);
  assert.equal(rconStillLoading({ processStartedAt: 5, createdAt: 1 }, new Error("connect ECONNREFUSED"), 10), true);
  assert.equal(rconStillLoading({}, new Error("rcon timed out")), false);
});
