import test from "node:test";
import assert from "node:assert/strict";
import { sourceIdentityConfiguration, openFortressIdentityConfiguration } from "./customerIsolation.js";

const tf = ["-game","tf","-dedicated","-norestart","+ip","0.0.0.0","+map","ctf_2fort","+maxplayers","16","-port","27015","+hostname",'"Private server"',"+tf_bot_join_after_player","0","+tf_bot_quota_mode","fill","+tf_bot_quota","4"];
const cs = ["-dedicated","-usercon","+ip","0.0.0.0","+rcon_password","fixture","+map","de_dust2","-port","27030","-maxplayers","16","+hostname","Private server"];

test("native Source parses only the declared recipe fields",()=>{
  assert.deepEqual(sourceIdentityConfiguration("team-fortress-2",tf,27015),{name:"Private server",maxPlayers:16,map:"ctf_2fort",botFill:4,rconPassword:""});
  assert.equal(sourceIdentityConfiguration("counter-strike-2",cs,27030).rconPassword,"fixture");
});

test("Source rejects arbitrary options, repeated ports and command injection",()=>{
  for(const addition of [["+exec","payload.cfg"],["-port","27016"],["-game","other"],["+hostname","bad; quit"]]) {
    assert.throws(()=>sourceIdentityConfiguration("team-fortress-2",[...tf,...addition],27015));
  }
  for(const [field,value] of [["+map","../payload"],["+hostname",'"bad; quit"'],["+maxplayers","64"],["+tf_bot_quota","16"],["+tf_bot_quota_mode","normal"]]) {
    const changed=[...tf];changed[changed.indexOf(field)+1]=value;
    assert.throws(()=>sourceIdentityConfiguration("team-fortress-2",changed,27015));
  }
  assert.throws(()=>sourceIdentityConfiguration("team-fortress-2",tf,27030));
  assert.throws(()=>sourceIdentityConfiguration("goldeneye-source",cs,27030));
});

test("i386 Source preserves its native map, limit and fenced ports",()=>{
  const args=["-game","cstrike","-strictportbind","+clientport","28060","-nohltv","-norestart","+ip","0.0.0.0","-port","27060","+map","de_dust2","-maxplayers","12","+mp_timelimit","25","+hostname",'"Private server"'];
  // clientport must equal the allocated gameplay port plus 1000.
  const safe=args;
  const wrongPort=[...args];wrongPort[wrongPort.indexOf("+clientport")+1]="1234";
  assert.throws(()=>sourceIdentityConfiguration("counter-strike-source",wrongPort,27060));
  assert.deepEqual(sourceIdentityConfiguration("counter-strike-source",safe,27060),{name:"Private server",maxPlayers:12,map:"de_dust2",botFill:0,rconPassword:"",timeLimit:25});
});

test("Open Fortress accepts only its fixed SDK startup contract",()=>{
  const args=["-game","open_fortress","-norestart","-strictportbind","-nohltv","-ip","0.0.0.0","-port","27150","+clientport","28150","+exec","playbound-managed.cfg","+map","dm_2fort","+maxplayers","16","+mp_timelimit","20","+tf_bot_join_after_player","0","+tf_bot_quota_mode","fill","+tf_bot_quota","4"];
  assert.deepEqual(openFortressIdentityConfiguration(args,27150,"Private fortress","fixture"),{name:"Private fortress",maxPlayers:16,map:"dm_2fort",botFill:4,timeLimit:20,rconPassword:"fixture"});
  for(const [key,value] of [["-game","tf"],["+clientport","1234"],["+exec","payload.cfg"],["+map","../payload"],["+maxplayers","64"],["+tf_bot_quota_mode","normal"]]){
    const changed=[...args];changed[changed.indexOf(key)+1]=value;
    assert.throws(()=>openFortressIdentityConfiguration(changed,27150,"Private fortress","fixture"));
  }
  assert.throws(()=>openFortressIdentityConfiguration([...args,"+exec","payload.cfg"],27150,"Private fortress","fixture"));
});
