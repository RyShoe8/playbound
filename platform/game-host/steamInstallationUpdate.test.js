import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { updateSteamInstallation } from "./steamInstallationUpdate.js";

const appId = 232250;
const oldManifest = '"appid" "232250" "StateFlags" "4" "buildid" "100" "InstalledDepots" { "232250" { "manifest" "123456" } }';
const denial = (app = appId, manifest = "123456") => `CDepotDownloadMgr::BYldRequestDepotManifest(App: ${app}, Depot: 232250, Manifest: ${manifest}, branch: ): Failed to get manifest request code, 'Access Denied' secret=hidden\n`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-steam-recovery-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stage = path.join(root, ".pb-update-team-fortress-2-11111111-1111-4111-8111-111111111111");
  const hostHome = path.join(root, "home");
  const log = path.join(hostHome, "Steam/logs/content_log.txt");
  const manifest = path.join(stage, `steamapps/appmanifest_${appId}.acf`);
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(manifest, oldManifest);
  fs.writeFileSync(log, "");
  fs.writeFileSync(path.join(stage, "server.cfg"), "preserve settings");
  return { stage, hostHome, appId, gamesRoot: root, log, manifest };
}

test("retired manifest recovery validates the staged files once and preserves the branch", async t => {
  const f = fixture(t);
  let calls = 0, notices = 0;
  await updateSteamInstallation({ ...f, branch: "preview" }, {
    onRecovery: () => notices++,
    run: async (command, args) => {
      assert.equal(command, "/usr/games/steamcmd");
      assert.deepEqual(args.slice(0, 8), ["+force_install_dir", f.stage, "+login", "anonymous", "+app_update", "232250", "-beta", "preview"]);
      if (++calls === 1) {
        fs.appendFileSync(f.log, denial());
        throw new Error("SteamCMD download failed; the current installation was preserved");
      }
      assert.deepEqual(args.slice(-2), ["validate", "+quit"]);
      assert.equal(fs.existsSync(f.manifest), false);
      assert.equal(fs.readFileSync(path.join(f.stage, ".pb-retired-appmanifest-232250.acf"), "utf8"), oldManifest);
      fs.writeFileSync(f.manifest, oldManifest.replace('"100"', '"200"'));
      return "Success! App '232250' fully installed.";
    },
  });
  assert.equal(calls, 2);
  assert.equal(notices, 1);
  assert.equal(fs.existsSync(path.join(f.stage, ".pb-retired-appmanifest-232250.acf")), false);
  assert.equal(fs.readFileSync(path.join(f.stage, "server.cfg"), "utf8"), "preserve settings");
});

test("successful normal update leaves metadata intact and does not validate unnecessarily", async t => {
  const f = fixture(t);
  let calls = 0;
  await updateSteamInstallation(f, { run: async (_, args) => {
    calls++;
    assert.equal(args.includes("validate"), false);
    return "Success! App '232250' already up to date.";
  } });
  assert.equal(calls, 1);
  assert.equal(fs.readFileSync(f.manifest, "utf8"), oldManifest);
});

test("historical errors and other games cannot trigger metadata recovery", async t => {
  for (const scenario of ["historical", "other-app", "rotated", "missing-log"]) {
    const f = fixture(t);
    if (scenario === "historical") fs.writeFileSync(f.log, denial());
    if (scenario === "missing-log") fs.unlinkSync(f.log);
    let calls = 0;
    await assert.rejects(updateSteamInstallation(f, { run: async () => {
      calls++;
      if (scenario === "other-app") fs.appendFileSync(f.log, denial(730));
      if (scenario === "missing-log") fs.writeFileSync(f.log, denial());
      if (scenario === "rotated") { fs.renameSync(f.log, `${f.log}.old`); fs.writeFileSync(f.log, denial()); }
      throw new Error("SteamCMD download failed");
    } }), /SteamCMD download failed/);
    assert.equal(calls, 1);
    assert.equal(fs.readFileSync(f.manifest, "utf8"), oldManifest);
  }
});

test("denied new manifests are reported accurately without resetting or leaking logs", async t => {
  const f = fixture(t);
  let calls = 0;
  await assert.rejects(updateSteamInstallation(f, { run: async () => {
    calls++;
    fs.appendFileSync(f.log, denial(appId, "654321"));
    throw new Error("SteamCMD download failed");
  } }), error => /depot manifest access was denied/.test(error.message) && !/secret|hidden|654321/.test(error.message));
  assert.equal(calls, 1);
  assert.equal(fs.readFileSync(f.manifest, "utf8"), oldManifest);
});

test("failed recovery stops after one retry and retains the old manifest for inspection", async t => {
  const f = fixture(t);
  let calls = 0;
  await assert.rejects(updateSteamInstallation(f, { run: async () => {
    calls++;
    fs.appendFileSync(f.log, denial());
    throw new Error("SteamCMD download failed");
  } }), /depot manifest access was denied/);
  assert.equal(calls, 2);
  assert.equal(fs.readFileSync(path.join(f.stage, ".pb-retired-appmanifest-232250.acf"), "utf8"), oldManifest);
});

test("disk and timeout safety stops never trigger recovery", async t => {
  for (const message of ["Update stopped to preserve free disk space", "Update command timed out"]) {
    const f = fixture(t);
    let calls = 0;
    await assert.rejects(updateSteamInstallation(f, { run: async () => {
      calls++;
      fs.appendFileSync(f.log, denial());
      throw new Error(message);
    } }), error => error.message === message);
    assert.equal(calls, 1);
    assert.equal(fs.readFileSync(f.manifest, "utf8"), oldManifest);
  }
});

test("active installation paths and linked metadata are refused before Steam runs", async t => {
  const f = fixture(t);
  const run = async () => assert.fail("Steam should not run");
  const active = path.join(f.gamesRoot, "team-fortress-2");
  fs.cpSync(f.stage, active, { recursive: true });
  await assert.rejects(updateSteamInstallation({ ...f, stage: active }, { run }), /isolated staging/);
  fs.unlinkSync(f.manifest);
  fs.linkSync(path.join(active, `steamapps/appmanifest_${appId}.acf`), f.manifest);
  await assert.rejects(updateSteamInstallation(f, { run }), /manifest requires inspection/);
});
