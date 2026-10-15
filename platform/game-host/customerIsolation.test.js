import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { customerIsolationLaunch } from "./customerIsolation.js";

const id = "0123456789abcdef01234567";
test("only reviewed customer Teeworlds launches select isolation", () => {
  for (const value of [{ gameSlug: "teeworlds", customerOwned: false }, { gameSlug: "openra", customerOwned: true }]) assert.equal(customerIsolationLaunch(value), null);
  assert.throws(() => customerIsolationLaunch({ gameSlug: "teeworlds", customerOwned: true, communityServerId: "../private", home: "/fixture" }), /identity/);
  assert.throws(() => customerIsolationLaunch({ gameSlug: "teeworlds", customerOwned: true, communityServerId: id, home: "/fixture", binary: "/tmp/server" }), /reviewed/);
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
    assert.throws(() => customerIsolationLaunch(input), /Unsafe isolation/);
  } finally {
    if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
    fs.rmSync(home, { recursive: true, force: true });
  }
});
