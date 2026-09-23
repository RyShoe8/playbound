const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MAIN_PATH = path.join(__dirname, "..", "..", "main.js");
const DETAIL_PATH = path.join(__dirname, "..", "..", "renderer", "views", "detail.js");

test("main.js does not check !game.installed in onSessionRequest", () => {
  const src = fs.readFileSync(MAIN_PATH, "utf8");
  assert.ok(!src.includes("!game.installed"), "main.js should not check !game.installed on state records");
  assert.ok(src.includes("resolvePlayableRemoteEdition"), "main.js should use resolvePlayableRemoteEdition");
});

test("detail.js does not render create shortcut option", () => {
  const src = fs.readFileSync(DETAIL_PATH, "utf8");
  assert.ok(!src.includes("act-shortcut"), "detail.js should not have act-shortcut");
  assert.ok(!src.includes("Create Shortcut"), "detail.js should not have Create Shortcut");
});

test("resolvePlayableRemoteEdition handles game install records without .installed property", (t) => {
  const src = fs.readFileSync(MAIN_PATH, "utf8");

  const grab = (name) => {
    const start = src.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} not found in main.js`);
    let depth = 0;
    let i = src.indexOf("{", start);
    const open = i;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    return src.slice(start, i + 1);
  };

  const fnSrc = [
    grab("ensureGameInstallRecord"),
    grab("listEditionEntries"),
    grab("findJarInDir"),
    grab("exeOnDisk"),
    grab("playableExePath"),
    grab("pickPrimaryEdition"),
    grab("syncGameInstallSummary"),
    grab("maybeDiscoverBaseGameInEditionDir"),
    grab("installedEditionsPayload"),
    grab("resolvePlayableRemoteEdition"),
  ].join("\n\n");

  const tmpDir = fs.mkdtempSync(path.join(path.dirname(__filename), "tmp-remote-test-"));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const fakeExe = path.join(tmpDir, "game.exe");
  fs.writeFileSync(fakeExe, "fake binary");

  const catalog = [];
  const catalogEntry = () => null;
  const isUninstallerExe = () => false;
  const findExecutable = () => fakeExe;
  const sameFsPath = (a, b) => path.resolve(a) === path.resolve(b);
  const DEFAULT_EDITION_SLUG = "official";

  const factory = new Function(
    "fs",
    "path",
    "catalog",
    "catalogEntry",
    "isUninstallerExe",
    "findExecutable",
    "sameFsPath",
    "DEFAULT_EDITION_SLUG",
    `${fnSrc}; return { resolvePlayableRemoteEdition };`
  );

  const { resolvePlayableRemoteEdition } = factory(
    fs,
    path,
    catalog,
    catalogEntry,
    isUninstallerExe,
    findExecutable,
    sameFsPath,
    DEFAULT_EDITION_SLUG
  );

  // 1. Not in state -> null
  assert.equal(resolvePlayableRemoteEdition("missing-game", null, {}), null);

  // 2. Installed in state (standard edition format without .installed) -> resolves
  const installedState = {
    "openra": {
      editions: {
        official: {
          exe: fakeExe,
          dir: tmpDir,
          editionSlug: "official",
        },
      },
    },
  };
  const res1 = resolvePlayableRemoteEdition("openra", null, installedState);
  assert.ok(res1);
  assert.equal(res1.ok, true);
  assert.equal(res1.editionSlug, "official");

  // 3. Request specific edition that is installed -> resolves that edition
  const multiEditionState = {
    "openra": {
      editions: {
        official: {
          exe: fakeExe,
          dir: tmpDir,
          editionSlug: "official",
        },
        ra2: {
          exe: fakeExe,
          dir: tmpDir,
          editionSlug: "ra2",
        },
      },
    },
  };
  const res2 = resolvePlayableRemoteEdition("openra", "ra2", multiEditionState);
  assert.ok(res2);
  assert.equal(res2.editionSlug, "ra2");

  // 4. Request edition that is not installed, but official is -> falls back to installed edition
  const res3 = resolvePlayableRemoteEdition("openra", "nonexistent-edition", installedState);
  assert.ok(res3);
  assert.equal(res3.editionSlug, "official");

  // 5. State record pointing to non-existent executable -> null
  const deadState = {
    "openra": {
      editions: {
        official: {
          exe: path.join(tmpDir, "does-not-exist.exe"),
          dir: tmpDir,
        },
      },
    },
  };
  assert.equal(resolvePlayableRemoteEdition("openra", null, deadState), null);
});
