import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDailyInstallationUpdates, latestInstallationBuild, steamPublicBuild } from "./dailyInstallationUpdates.js";
import { createInstallationCoordinator, createInstallationStore } from "./installationJobs.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-daily-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gamesRoot = path.join(root, "games"), stateDir = path.join(root, "state");
  const current = path.join(gamesRoot, "team-fortress-2");
  fs.mkdirSync(path.join(current, "steamapps"), { recursive: true });
  const manifest = path.join(current, "steamapps/appmanifest_232250.acf");
  const install = (build = "100", branch = "") => fs.writeFileSync(manifest, `"appid" "232250" "StateFlags" "4" "buildid" "${build}" ${branch ? `"BetaKey" "${branch}"` : ""}`);
  install(); fs.writeFileSync(path.join(current, "srcds_linux64"), "fixture", { mode: 0o755 });
  const running = [], launches = [];
  const coordinator = createInstallationCoordinator({ stateDir, gamesRoot, rooms: () => running, scan: async () => 0, launch: async (job) => launches.push(job) });
  let clock = 1_000_000, calls = 0, version = "200", fail = false;
  const latest = async () => { calls++; if (fail) throw new Error("private error never exposed"); return version; };
  const daily = () => createDailyInstallationUpdates({ stateDir, coordinator, latest, now: () => clock });
  const store = createInstallationStore(stateDir);
  return { stateDir, coordinator, running, launches, store, install, daily,
    advance: () => { clock += 24 * 60 * 60_000; }, calls: () => calls,
    version: (value) => { version = value; }, fail: (value) => { fail = value; } };
}

test("Steam public build ignores beta/depot build IDs and fails closed on missing/duplicate metadata", () => {
  const info = 'Steam log "232250" { "depots" { "123" { "buildid" "999" } "branches" { "preview" { "buildid" "888" } "public" { "buildid" "200" } } } }';
  assert.equal(steamPublicBuild(info, 232250), "200");
  assert.throws(() => steamPublicBuild(info, 730));
  assert.throws(() => steamPublicBuild(info.replace('"public"', '"private"'), 232250));
  assert.throws(() => steamPublicBuild(info.replace('"buildid" "200"', '"buildid" "200" "buildid" "300"'), 232250));
});

test("daily release check queues once across repeated polls, concurrent calls and restart; never stops running games", async (t) => {
  const f = fixture(t); f.running.push({ gameSlug: "tf2" });
  const updater = f.daily();
  await Promise.all([updater.tick(), updater.tick()]);
  await f.daily().tick();
  assert.equal(f.calls(), 1); assert.equal(f.store.all().length, 1);
  await f.coordinator.tick(); assert.equal(f.launches.length, 0);
  f.advance(); await f.daily().tick(); assert.equal(f.store.all().length, 1);
  assert.equal(f.daily().snapshot().targets["team-fortress-2"].status, "queued");
});

test("unchanged or older releases create no jobs and pinned handlers are explicitly review required", async (t) => {
  const f = fixture(t); f.version("100"); await f.daily().tick();
  assert.equal(f.store.all().length, 0);
  assert.equal(f.daily().snapshot().targets.xonotic.status, "review_required");
  f.advance(); f.version("99"); await f.daily().tick(); assert.equal(f.store.all().length, 0);
});

test("failed discovery retries next day without exposing errors or changing installations", async (t) => {
  const f = fixture(t); f.fail(true); await f.daily().tick();
  assert.equal(f.store.all().length, 0);
  const row = f.daily().snapshot().targets["team-fortress-2"];
  assert.equal(row.status, "check_failed"); assert.doesNotMatch(row.message, /private/);
  f.advance(); f.fail(false); await f.daily().tick(); assert.equal(f.store.all().length, 1);
});

test("cancelled or failed build is not requeued daily; a genuinely new build is eligible", async (t) => {
  const f = fixture(t); await f.daily().tick();
  f.coordinator.cancel(f.store.all()[0].id);
  f.advance(); await f.daily().tick(); assert.equal(f.store.all().length, 1);
  assert.equal(f.daily().snapshot().targets["team-fortress-2"].status, "review_required");
  f.advance(); f.version("300"); await f.daily().tick(); assert.equal(f.store.all().length, 2);
});

test("completed update followed by rollback is not silently undone by the next daily check", async (t) => {
  const f = fixture(t); await f.daily().tick();
  f.store.write({ ...f.store.all()[0], status: "completed" }); f.install("200");
  f.advance(); await f.daily().tick();
  f.install("100"); f.advance(); await f.daily().tick();
  assert.equal(f.store.all().length, 1);
  assert.equal(f.daily().snapshot().targets["team-fortress-2"].status, "review_required");
});

test("non-public installed Steam branches are not switched automatically", async (t) => {
  const f = fixture(t); f.install("100", "preview"); await f.daily().tick();
  assert.equal(f.calls(), 0); assert.equal(f.store.all().length, 0);
});

test("maintenance worker and metadata probes never launch concurrently", async (t) => {
  const f = fixture(t); f.coordinator.queue("team-fortress-2", "update", "admin");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const checking = f.coordinator.withMetadataCheck(() => gate);
  await f.coordinator.tick(); assert.equal(f.launches.length, 0);
  release(); await checking; await f.coordinator.tick(); assert.equal(f.launches.length, 1);
});

test("Steam discovery uses its own home and read-only app metadata commands", async (t) => {
  const f = fixture(t);
  const build = await latestInstallationBuild("team-fortress-2", { steamHome: path.join(f.stateDir, "metadata-home"), run: async (command, args) => {
    assert.equal(command, "/usr/bin/env"); assert.equal(args[0], "-i"); assert.ok(args.some((arg) => arg.startsWith("HOME=")));
    assert.ok(args.includes("+app_info_update")); assert.ok(!args.includes("+app_update"));
    return '"232250" { "depots" { "branches" { "public" { "buildid" "200" } } } }';
  } });
  assert.equal(build, "200");
});

test("a stale interrupted daily check catches up after restart instead of waiting another day", async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.stateDir, "daily-installation-updates.json"), JSON.stringify({ version: 1, enabled: true, startedAt: 1, nextCheckAt: 100_000_000, targets: {} }));
  f.advance(); await f.daily().tick();
  assert.equal(f.calls(), 1); assert.equal(f.store.all().length, 1);
});

test("official GitHub discovery rejects prereleases before they can be queued", async () => {
  await assert.rejects(latestInstallationBuild("mindustry", { request: async () => new Response(JSON.stringify({ draft: false, prerelease: true, tag_name: "v999" })) }), /stable/);
  assert.equal(await latestInstallationBuild("mindustry", { request: async () => new Response(JSON.stringify({ draft: false, prerelease: false, tag_name: "v160.7" })) }), "160.7");
});

test("ET Legacy discovers the stable publisher version and refuses malformed metadata", async () => {
  assert.equal(await latestInstallationBuild("wolfenstein-enemy-territory", { request: async () => new Response("<h2>ET: Legacy stable release 2.86.2 - Taking Fire!!!</h2>") }), "2.86.2");
  await assert.rejects(latestInstallationBuild("wolfenstein-enemy-territory", { request: async () => new Response("<html>upstream unavailable</html>") }), /metadata is unavailable/);
});

test("TES3MP and RVGL discover official versions without confusing game and engine versions", async () => {
  assert.equal(await latestInstallationBuild("morrowind", { request: async (url) => {
    assert.ok(url.endsWith("/releases?per_page=30"));
    return new Response(JSON.stringify([
      { draft: false, prerelease: false, tag_name: "tes3mp-9.0.0-vr" },
      { draft: false, prerelease: true, tag_name: "tes3mp-10.0.0" },
      { draft: false, prerelease: false, tag_name: "tes3mp-0.7.0" },
      { draft: false, prerelease: false, tag_name: "tes3mp-0.8.1" },
    ]));
  } }), "0.8.1");
  await assert.rejects(latestInstallationBuild("morrowind", { request: async () => new Response(JSON.stringify([{ draft: false, prerelease: false, tag_name: "tes3mp-0.8.1-vr" }])) }), /standard release is unavailable/);
  assert.equal(await latestInstallationBuild("re-volt-rvgl", { request: async () => new Response('<div>Current version: <b>23.1030a1</b></div>') }), "23.1030a1");
  await assert.rejects(latestInstallationBuild("re-volt-rvgl", { request: async () => new Response("No stable version available") }), /metadata is unavailable/);
});

test("new pinned component releases require review, while unchanged lettered RVGL versions do not queue", async (t) => {
  const f = fixture(t); let current = "23.1030a1";
  const coordinator = { snapshot: () => ({ targets: [{ key: "re-volt-rvgl", installed: true, buildId: "23.1030a1" }] }), withMetadataCheck: (fn) => fn(), queue: () => { throw new Error("must not queue"); } };
  const daily = () => createDailyInstallationUpdates({ stateDir: f.stateDir, coordinator, latest: async () => current, now: () => Date.now() });
  await daily().tick(); assert.equal(daily().snapshot().targets["re-volt-rvgl"].status, "up_to_date");
  fs.unlinkSync(path.join(f.stateDir,"daily-installation-updates.json")); current = "24.0101a1";
  await daily().tick(); assert.equal(daily().snapshot().targets["re-volt-rvgl"].status, "review_required");
});
