import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { customerIsolationLaunch, validateCustomerPreparation, CUSTOMER_ISOLATION_GAMES, openArenaIdentityConfiguration, superTuxKartIdentityConfiguration } from "./customerIsolation.js";
import { NATIVE_PACKAGE_PROFILES } from "./nativePackageUpdates.js";

const id = "0123456789abcdef01234567";
test("SuperTuxKart identity accepts declared modes and bounded slots only", () => {
  for (const mode of [0,1,3,4,6,7,8]) {
    const args=['--lan-server=Private fixture','--port=2779','--no-graphics','--max-players=12',`--mode=${mode}`,'--difficulty=3'];
    assert.deepEqual(JSON.parse(superTuxKartIdentityConfiguration(args).config),{name:"Private fixture",maxPlayers:12,mode,difficulty:3});
    for (const bad of [[...args,'--config=/tmp/unsafe'],args.map(x=>x==='--port=2779'?'--port=0':x),args.map(x=>x==='--max-players=12'?'--max-players=13':x),args.map(x=>x===`--mode=${mode}`?'--mode=5':x)]) assert.throws(()=>superTuxKartIdentityConfiguration(bad));
  }
});
test("OpenArena identity handoff accepts only recipe settings and keeps ordinary launches unchanged", () => {
  const fixed = {com_basegame:"baseoa",fs_basepath:"/usr/lib/openarena-server",com_homepath:".openarena",com_legacyprotocol:"71",com_protocol:"71",cl_motd:"0",dedicated:"1",net_port:"27980",sv_hostname:"Private fixture",sv_master1:'""',rconpassword:"a".repeat(32),sv_maxclients:"4",bot_enable:"1",bot_minplayers:"2"};
  const args = Object.entries(fixed).flatMap(([key,value])=>["+set",key,value]).concat(["+map","oa_dm1"]);
  const result = openArenaIdentityConfiguration(args);
  assert.equal(result.port,27980);
  assert.deepEqual(JSON.parse(result.config),{maxPlayers:4,botPlayers:2,name:"Private fixture",rconPassword:"a".repeat(32)});
  for (const invalid of [[...args,"+exec","payload.cfg"],["+set","fs_game","payload",...args],args.map(value=>value==="27980"?"27981":value),args.map(value=>value==="Private fixture"?'name";quit':value),args.map(value=>value==="2"?"5":value)]) assert.throws(()=>openArenaIdentityConfiguration(invalid));
  assert.equal(customerIsolationLaunch({gameSlug:"openarena",customerOwned:true}),null);
});
for (const [gameSlug, profile] of Object.entries(NATIVE_PACKAGE_PROFILES)) {
  if (!CUSTOMER_ISOLATION_GAMES.includes(gameSlug)) continue;
  const root = path.join("/opt/playbound-host/games", gameSlug);
  const binary = path.join(root, profile.binary);
  test(`${gameSlug} reviewed managed binary has only a read-only native mount`, { skip: process.platform !== "linux" || !fs.existsSync(binary) || !fs.existsSync("/usr/bin/bwrap") }, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pb-managed-native-sandbox-"));
    try {
      let args = gameSlug === "bzflag" ? ["-p", "5174", "-offa", "-q", "-j", "+r", "+s", "3", "-mp", "4"] : ["-p", "46650"];
      if (gameSlug === "teeworlds") {
        const config = path.join(home, "teeworlds", `pb-${id}.cfg`);
        fs.mkdirSync(path.dirname(config)); fs.writeFileSync(config, "sv_port 8322\nsv_register 0\nsv_max_clients 4\n");
        args = ["-f", config, "sv_port 8322"];
      }
      if (gameSlug === "openttd") {
        const config = path.join(home, "openttd", `pb-${id.slice(-16)}.cfg`);
        fs.mkdirSync(path.dirname(config)); fs.writeFileSync(config, "[network]\nmax_clients = 4\n");
        args = ["-D", "0.0.0.0:3999", "-c", config];
      }
      if (gameSlug === "luanti") {
        const data = path.join(home, "luanti-servers", `pb-${id}`), config = path.join(data, "world", "playbound.conf");
        fs.mkdirSync(path.dirname(config), { recursive: true, mode: 0o700 }); fs.writeFileSync(config, "server_announce = false\nmax_users = 4\n");
        args = ["--port", "30020", "--world", path.dirname(config), "--gameid", "minetest", "--config", config, "--logfile", path.join(data, "minetest.log")];
      }
      const plan = customerIsolationLaunch({ gameSlug, customerOwned: true, communityServerId: id, binary, args, home });
      const mount = plan.args.findIndex((arg, i) => arg === "--ro-bind" && plan.args[i + 1] === binary);
      assert.ok(mount >= 0); assert.equal(plan.args[mount + 2], profile.systemBinary);
      const delimiter = plan.args.lastIndexOf("--");
      const result = execFileSync(plan.binary, [...plan.args.slice(0, delimiter + 1), "/usr/bin/sh", "-c", `test ! -e /opt/playbound-host/agent && test ! -e /etc/playbound-game-host.env && test ! -e /var/lib/playbound-host && test -z "$FIXTURE_SECRET" && ! touch '${profile.systemBinary}' && echo verified`], { env: { ...plan.env, FIXTURE_SECRET: "fixture-only" }, encoding: "utf8", timeout: 10000 });
      assert.match(result, /verified/);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
}
test("UID handoff is opt-in and never replaces an existing data folder with an empty server", { skip: process.platform !== "linux" || !fs.existsSync("/usr/games/teeworlds-server") }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pb-uid-plan-"));
  try {
    fs.mkdirSync(path.join(home, "teeworlds"));
    const config = path.join(home, "teeworlds", `pb-${id}.cfg`);
    fs.writeFileSync(config, "sv_port 8322\nsv_register 0\nsv_max_clients 4\n");
    const opts = { gameSlug: "teeworlds", customerOwned: true, communityServerId: id, binary: "/usr/games/teeworlds-server", args: ["-f", config, "sv_port 8322"], home };
    assert.equal(customerIsolationLaunch(opts).identityProfile, undefined);
    const plan = customerIsolationLaunch({ ...opts, identityProfile: "teeworlds-unix-v1" });
    assert.equal(plan.identityRuntime.port, 8322);
    assert.match(plan.identityRuntime.config, /sv_register 0/);
    const saved = path.join(plan.cwd, "saved.map");
    fs.writeFileSync(saved, "preserve fixture data");
    assert.throws(() => customerIsolationLaunch({ ...opts, identityProfile: "teeworlds-unix-v1" }), /migration/);
    assert.equal(fs.readFileSync(saved, "utf8"), "preserve fixture data");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
test("community rooms and unreviewed engines keep their existing launch path", () => {
  for (const value of [{ gameSlug: "teeworlds", customerOwned: false }, { gameSlug: "openra", customerOwned: true }]) assert.equal(customerIsolationLaunch(value), null);
  assert.throws(() => customerIsolationLaunch({ gameSlug: "teeworlds", customerOwned: true, communityServerId: "../private", home: "/fixture" }), /identity/);
  assert.throws(() => customerIsolationLaunch({ gameSlug: "teeworlds", customerOwned: true, communityServerId: id, home: "/fixture", binary: "/tmp/server", args: [] }), /reviewed/);
});

test("each reviewed engine rejects custom binaries and malformed identities", () => {
  for (const gameSlug of CUSTOMER_ISOLATION_GAMES) {
    assert.equal(customerIsolationLaunch({ gameSlug, customerOwned: false }), null);
    assert.throws(() => customerIsolationLaunch({ gameSlug, customerOwned: true, communityServerId: "../private", home: "/fixture", args: [] }), /identity/);
    assert.throws(() => customerIsolationLaunch({ gameSlug, customerOwned: true, communityServerId: id, home: "/fixture", binary: "/tmp/custom", args: [] }), /reviewed/);
  }
});

test("preparation refuses a hardlinked configuration before recipes can overwrite it", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pb-preparation-"));
  try {
    const config = path.join(home, "teeworlds", `pb-${id}.cfg`);
    fs.mkdirSync(path.dirname(config));
    const unrelated = path.join(home, "unrelated");
    fs.writeFileSync(unrelated, "preserve");
    fs.linkSync(unrelated, config);
    assert.throws(() => validateCustomerPreparation({ gameSlug: "teeworlds", customerOwned: true, communityServerId: id, home }), /Unsafe isolation/);
    assert.equal(fs.readFileSync(unrelated, "utf8"), "preserve");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("preparation refuses symlinked worlds without creating files in the destination", { skip: process.platform === "win32" }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pb-preparation-link-"));
  try {
    const root = path.join(home, "luanti-servers", `pb-${id}`);
    const unrelated = path.join(home, "unrelated");
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(unrelated);
    fs.symlinkSync(unrelated, path.join(root, "world"));
    assert.throws(() => validateCustomerPreparation({ gameSlug: "luanti", customerOwned: true, communityServerId: id, home }), /Linked customer/);
    assert.deepEqual(fs.readdirSync(unrelated), []);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

const supported = process.platform === "linux" && fs.existsSync("/usr/bin/bwrap") && fs.existsSync("/usr/games/teeworlds-server");
test("sandbox hides other customer state, host processes and agent files", { skip: !supported }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pb-isolation-"));
  let child;
  try {
    fs.mkdirSync(path.join(home, "teeworlds"));
    const config = path.join(home, "teeworlds", `pb-${id}.cfg`);
    fs.writeFileSync(config, "sv_register 0\n");
    const input = { gameSlug: "teeworlds", customerOwned: true, communityServerId: id, binary: "/usr/games/teeworlds-server", args: ["-f", config, "sv_port 8322"], home };
    const plan = customerIsolationLaunch(input);
    assert.ok(!plan.args.includes("--die-with-parent"));
    assert.ok(!plan.args.includes("--new-session"));
    assert.ok(plan.args.includes("--disable-userns"));
    assert.throws(() => customerIsolationLaunch({ ...input, args: ["-f", "/other.cfg", "sv_port 8322"] }), /arguments/);
    // Replace only the final game command in this fixture to probe the same mounts.
    const delimiter = plan.args.lastIndexOf("--");
    const args = [...plan.args.slice(0, delimiter + 1), "/usr/bin/sh", "-c", `
      test ! -e '${home}' && test ! -e /opt/playbound-host/agent && test ! -e /etc/playbound-game-host.env &&
      test ! -e /var/lib/playbound-host && test ! -e /proc/${process.pid} &&
      test -f /server/server.cfg && test "$HOME" = /server && test -z "$FIXTURE_SECRET" &&
      ! touch /usr/pb-write-test && ! echo changed >> /server/server.cfg &&
      echo owned > /server/owned && echo 'boundary verified'
    `];
    const output = execFileSync(plan.binary, args, { cwd: plan.cwd, env: { ...plan.env, FIXTURE_SECRET: "must-not-inherit" }, encoding: "utf8", timeout: 5000 });
    assert.match(output, /boundary verified/);
    assert.equal(fs.readFileSync(path.join(plan.cwd, "owned"), "utf8").trim(), "owned");
    // Namespace wrapper remains detached and group-addressable by the agent.
    child = spawn(plan.binary, [...plan.args.slice(0, delimiter + 1), "/usr/bin/sleep", "30"], { cwd: plan.cwd, env: plan.env, detached: true, stdio: "ignore" });
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(child.exitCode, null);
    process.kill(-child.pid, "SIGTERM");
    await new Promise(resolve => child.once("exit", resolve));
    child = null;
    assert.equal(fs.readFileSync(config, "utf8"), "sv_register 0\n");
    fs.unlinkSync(config);
    fs.symlinkSync("/usr/share/doc", config);
    assert.throws(() => customerIsolationLaunch(input), /Unsafe isolation|Linked customer/);
  } finally {
    if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
    fs.rmSync(home, { recursive: true, force: true });
  }
});

for (const [gameSlug, binary, args] of [
  ["bzflag", "/usr/games/bzfs", ["-p", "5174", "-offa", "-q", "-j", "+r", "+s", "3", "-mp", "4"]],
  ["hedgewars", "/usr/lib/hedgewars/bin/hedgewars-server", ["-p", "46650"]],
  ["openttd", "/usr/games/openttd", null],
  ["luanti", "/usr/games/minetestserver", null],
]) {
  test(`${gameSlug} has only its own writable home and fixed native arguments`, { skip: process.platform !== "linux" || !fs.existsSync(binary) || !fs.existsSync("/usr/bin/bwrap") }, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pb-isolation-native-"));
    try {
      let nativeArgs = args;
      let config;
      if (gameSlug === "openttd") {
        fs.mkdirSync(path.join(home, "openttd"));
        config = path.join(home, "openttd", `pb-${id.slice(-16)}.cfg`);
        fs.writeFileSync(config, "[network]\nmax_clients = 4\n");
        nativeArgs = ["-D", "0.0.0.0:3999", "-c", config];
      }
      if (gameSlug === "luanti") {
        const data = path.join(home, "luanti-servers", `pb-${id}`);
        fs.mkdirSync(path.join(data, "world"), { recursive: true, mode: 0o700 });
        config = path.join(data, "world", "playbound.conf");
        fs.writeFileSync(config, "server_announce = false\nmax_users = 4\n");
        nativeArgs = ["--port", "30020", "--world", path.join(data, "world"), "--gameid", "minetest", "--config", config, "--logfile", path.join(data, "minetest.log")];
      }
      const input = { gameSlug, customerOwned: true, communityServerId: id, binary, args: nativeArgs, home };
      const plan = customerIsolationLaunch(input);
      assert.equal(plan.profile, `${gameSlug}-bwrap-v1`);
      const delimiter = plan.args.lastIndexOf("--");
      const output = execFileSync(plan.binary, [...plan.args.slice(0, delimiter + 1), "/usr/bin/sh", "-c", `test ! -e '${home}' && test ! -e /var/lib/playbound-host && test ! -e /proc/${process.pid} && test -z "$AGENT_CREDENTIAL" && echo private > /server/sandbox-test && echo verified`], { env: { ...plan.env, AGENT_CREDENTIAL: "fixture-only" }, encoding: "utf8", timeout: 5000 });
      assert.match(output, /verified/);
      assert.equal(fs.readFileSync(path.join(plan.cwd, "sandbox-test"), "utf8").trim(), "private");
      assert.throws(() => customerIsolationLaunch({ ...input, args: [...nativeArgs, "--unreviewed"] }), /arguments/);
      if (config) {
        fs.unlinkSync(config);
        fs.symlinkSync("/usr/share/doc", config);
        assert.throws(() => customerIsolationLaunch(input), /Unsafe isolation|Linked customer/);
      }
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
}
