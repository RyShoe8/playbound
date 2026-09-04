/**
 * Pointing an OpenMW-family install at the player's Morrowind data.
 *
 * The failure this prevents was reported as "the game exited immediately after
 * launch (tes3mp.exe)", which sent the player to check GPU drivers. The real
 * cause was one line in the client's own log: "No content file given (esm/esp,
 * nor omwgame/omwaddon). Aborting..." — the engine had been installed with no
 * game to run.
 *
 * Run: node services/openMwConfig.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const {
  isOpenMwInstall,
  needsMorrowindData,
  mastersIn,
  archivesIn,
  CONTROLLER_MAPPINGS,
  mappingGuid,
  missingControllerMappings,
  withControllerMappings,
  dataDirsIn,
  missingArchives,
  withMorrowindData,
  withMorrowindArchives,
  morrowindDataCandidates,
  resolveMorrowindData,
} = require("./openMwConfig");

/** An exists() over a fixed set of paths, compared case-insensitively. */
const fakeExists = (present) => {
  const set = new Set(present.map((p) => p.toLowerCase()));
  return (p) => set.has(String(p).toLowerCase());
};

const DATA = "D:\\GOG\\Morrowind\\Data Files";
const full = [
  path.join(DATA, "Morrowind.esm"),
  path.join(DATA, "Tribunal.esm"),
  path.join(DATA, "Bloodmoon.esm"),
];

test("an OpenMW-family install is recognised by its config, not a slug list", () => {
  const dir = "C:\\Games\\morrowind\\tes3mp";
  const exists = fakeExists([path.join(dir, "openmw.cfg")]);
  assert.equal(isOpenMwInstall(dir, exists), true);
  // Keyed on the file so OpenMW, TES3MP and any future respin are all covered.
  assert.equal(isOpenMwInstall("C:\\Games\\openra", exists), false);
  assert.equal(isOpenMwInstall("", exists), false);
});

test("a stock config counts as needing data, despite having three data lines", () => {
  /*
   * This is the real shipped config. All three data entries point at the
   * engine's own empty folders, which is why `content=` is the test and
   * `data=` is not.
   */
  const stock = ['data="?global?data"', "data=./data", 'data-local="?userdata?data"'].join("\n");
  assert.equal(needsMorrowindData(stock), true);
  assert.equal(needsMorrowindData(`${stock}\ncontent=Morrowind.esm`), false);
});

test("a configured install is left alone", () => {
  assert.equal(needsMorrowindData("content=Morrowind.esm\n"), false);
  // Leading whitespace should not smuggle a second copy past the check.
  assert.equal(needsMorrowindData("   content = Morrowind.esm"), false);
});

test("masters come back in load order", () => {
  assert.deepEqual(mastersIn(DATA, fakeExists(full)), [
    "Morrowind.esm",
    "Tribunal.esm",
    "Bloodmoon.esm",
  ]);
});

test("a base install without the expansions is still valid", () => {
  const base = fakeExists([path.join(DATA, "Morrowind.esm")]);
  assert.deepEqual(mastersIn(DATA, base), ["Morrowind.esm"]);
});

test("expansions alone are not a Morrowind install", () => {
  /*
   * Tribunal and Bloodmoon cannot load without the base master, so writing a
   * directory holding only those would swap one abort for another.
   */
  const orphans = fakeExists([path.join(DATA, "Tribunal.esm"), path.join(DATA, "Bloodmoon.esm")]);
  assert.deepEqual(mastersIn(DATA, orphans), []);
});

test("the config is appended to, never rewritten", () => {
  const original = "fallback=Weather_Clear_Sky_Sunrise,118,141,164\ndata=./data";
  const out = withMorrowindData(original, DATA, ["Morrowind.esm", "Tribunal.esm"]);

  // Every original line survives — the file holds hundreds of fallback= entries
  // defining weather and UI colours, plus whatever the player changed.
  assert.ok(out.startsWith(original), "existing config must be preserved verbatim");
  assert.match(out, /^data="D:\\GOG\\Morrowind\\Data Files"$/m);
  assert.match(out, /^content=Morrowind\.esm$/m);
  assert.match(out, /^content=Tribunal\.esm$/m);
  assert.doesNotMatch(out, /content=Bloodmoon\.esm/, "only the masters actually present");
});

test("the appended config quotes the path, because it always has a space in it", () => {
  const out = withMorrowindData("", DATA, ["Morrowind.esm"]);
  assert.ok(out.includes(`data="${DATA}"`), "an unquoted Data Files path would not parse");
});

test("writing twice does not stack a second block", () => {
  const once = withMorrowindData("data=./data", DATA, ["Morrowind.esm"]);
  // The caller gates on needsMorrowindData, so a configured file is skipped.
  assert.equal(needsMorrowindData(once), false);
});

test("candidates cover both the install root and the Data Files inside it", () => {
  const list = morrowindDataCandidates({ extra: ["D:\\GOG\\Morrowind"] });
  assert.ok(list.includes(path.join("D:\\GOG\\Morrowind", "Data Files")));
  assert.ok(list.includes("D:\\GOG\\Morrowind"));
  // Most specific first: what the caller already knew beats a guessed drive.
  assert.equal(list[0], path.join("D:\\GOG\\Morrowind", "Data Files"));
});

test("resolution picks the first candidate that really holds the game", () => {
  const found = resolveMorrowindData(
    ["C:\\Nope\\Data Files", DATA, "D:\\Other"],
    fakeExists(full)
  );
  assert.equal(found.dataDir, DATA);
  assert.deepEqual(found.masters, ["Morrowind.esm", "Tribunal.esm", "Bloodmoon.esm"]);
});

test("resolution returns null rather than guessing when nothing is installed", () => {
  // The caller needs to tell the player to locate their copy; a wrong path
  // would produce the same silent abort with a different cause.
  assert.equal(resolveMorrowindData(["C:\\Nope"], fakeExists([])), null);
});

test("the real reported case: a GOG copy on another drive", () => {
  const candidates = morrowindDataCandidates({ drives: ["C:\\", "D:\\"] });
  const found = resolveMorrowindData(candidates, fakeExists(full));
  assert.equal(found.dataDir, DATA, "D:\\GOG\\Morrowind\\Data Files should be found by drive scan");
});

/*
 * The pink-menu bug.
 *
 * data= and content= are enough for the engine to load the world, so the game
 * starts and reaches the main menu — but every texture, mesh and font lives
 * inside the BSAs, and OpenMW only reads a BSA the config names with a
 * fallback-archive= line. Without them it draws its magenta placeholder for
 * everything, so the menu is unreadable pink boxes over a working game.
 */

const GOG_DATA = "D:\Gog\Morrowind\Data Files";
const GOG_FILES = new Set(
  ["Morrowind.esm", "Tribunal.esm", "Bloodmoon.esm", "Morrowind.bsa", "Tribunal.bsa", "Bloodmoon.bsa"].map(
    (f) => path.join(GOG_DATA, f)
  )
);
const gogExists = (p) => GOG_FILES.has(p);

test("a real GOTY install resolves its archives alongside its masters", () => {
  const found = resolveMorrowindData([GOG_DATA], gogExists);
  assert.deepEqual(found.masters, ["Morrowind.esm", "Tribunal.esm", "Bloodmoon.esm"]);
  assert.deepEqual(found.archives, ["Morrowind.bsa", "Tribunal.bsa", "Bloodmoon.bsa"]);
});

test("a fresh write registers the archives, not just the masters", () => {
  const found = resolveMorrowindData([GOG_DATA], gogExists);
  const out = withMorrowindData("# stock\n", found.dataDir, found.masters, found.archives);
  for (const bsa of ["Morrowind.bsa", "Tribunal.bsa", "Bloodmoon.bsa"]) {
    assert.match(out, new RegExp(`^fallback-archive=${bsa}$`, "m"), `${bsa} not registered`);
  }
  // And the config it already produced is still there.
  assert.match(out, /^data="D:\Gog\Morrowind\Data Files"$/m);
  assert.match(out, /^content=Morrowind\.esm$/m);
});

test("archives are listed before content, in load order", () => {
  const found = resolveMorrowindData([GOG_DATA], gogExists);
  const out = withMorrowindData("", found.dataDir, found.masters, found.archives);
  const at = (s) => out.indexOf(s);
  assert.ok(at("fallback-archive=Morrowind.bsa") < at("fallback-archive=Tribunal.bsa"));
  assert.ok(at("fallback-archive=Tribunal.bsa") < at("fallback-archive=Bloodmoon.bsa"));
  assert.ok(at("fallback-archive=Bloodmoon.bsa") < at("content=Morrowind.esm"));
});

test("an install with only the base game registers only the base archive", () => {
  const baseOnly = new Set([path.join(GOG_DATA, "Morrowind.esm"), path.join(GOG_DATA, "Morrowind.bsa")]);
  const found = resolveMorrowindData([GOG_DATA], (p) => baseOnly.has(p));
  assert.deepEqual(found.archives, ["Morrowind.bsa"]);
  const out = withMorrowindData("", found.dataDir, found.masters, found.archives);
  // Naming a BSA that is not on disk is itself an error at startup.
  assert.doesNotMatch(out, /Tribunal\.bsa/);
  assert.doesNotMatch(out, /Bloodmoon\.bsa/);
});

/* --- the repair path, for installs already configured without archives --- */

const PINK = [
  "# stock config",
  'data="C:\Program Files\TES3MP\data"',
  `data="${GOG_DATA}"`,
  "content=Morrowind.esm",
  "content=Tribunal.esm",
  "content=Bloodmoon.esm",
  "",
].join("\n");

test("the pink-menu config is recognised as already having content", () => {
  // So the fresh-write path correctly declines it, and the repair path runs.
  assert.equal(needsMorrowindData(PINK), false);
});

test("dataDirsIn finds the Morrowind directory among the engine's own", () => {
  const dirs = dataDirsIn(PINK);
  assert.equal(dirs.length, 2);
  assert.ok(dirs.includes(GOG_DATA));
});

test("every archive is reported missing from the pink config", () => {
  assert.deepEqual(missingArchives(PINK, GOG_DATA, gogExists), [
    "Morrowind.bsa",
    "Tribunal.bsa",
    "Bloodmoon.bsa",
  ]);
});

test("the engine's own data dirs contribute nothing to repair", () => {
  // No BSAs live there, so it must not add lines for files that do not exist.
  assert.deepEqual(missingArchives(PINK, "C:\Program Files\TES3MP\data", gogExists), []);
});

test("repair adds the archives and leaves everything else untouched", () => {
  const missing = missingArchives(PINK, GOG_DATA, gogExists);
  const fixed = withMorrowindArchives(PINK, missing);
  for (const bsa of ["Morrowind.bsa", "Tribunal.bsa", "Bloodmoon.bsa"]) {
    assert.match(fixed, new RegExp(`^fallback-archive=${bsa}$`, "m"));
  }
  for (const line of PINK.split("\n").filter(Boolean)) {
    assert.ok(fixed.includes(line), `repair dropped: ${line}`);
  }
});

test("repair is idempotent — a second pass adds nothing", () => {
  const once = withMorrowindArchives(PINK, missingArchives(PINK, GOG_DATA, gogExists));
  assert.deepEqual(missingArchives(once, GOG_DATA, gogExists), []);
  assert.equal(withMorrowindArchives(once, []), once);
});

test("an already-correct config is left exactly as it was", () => {
  const good = `${PINK}\nfallback-archive=Morrowind.bsa\nfallback-archive=Tribunal.bsa\nfallback-archive=Bloodmoon.bsa\n`;
  assert.deepEqual(missingArchives(good, GOG_DATA, gogExists), []);
});

test("a partially repaired config gets only what it lacks", () => {
  const half = `${PINK}\nfallback-archive=Morrowind.bsa\n`;
  assert.deepEqual(missingArchives(half, GOG_DATA, gogExists), ["Tribunal.bsa", "Bloodmoon.bsa"]);
});

test("archive matching is not fooled by a similar line", () => {
  const decoy = `${PINK}\n# fallback-archive=Morrowind.bsa is commented out\n`;
  assert.ok(missingArchives(decoy, GOG_DATA, gogExists).includes("Morrowind.bsa"));
});

/* --- controller mappings for pads newer than the engine's SDL --- */

test("the DualSense is mapped for both USB and Bluetooth", () => {
  /*
   * The two enumerate as different devices: bus 0300 over USB, 0500 over
   * Bluetooth. A player on the cable and a player on Bluetooth are not the
   * same case, so one line each.
   */
  const guids = CONTROLLER_MAPPINGS.map(mappingGuid);
  assert.ok(guids.includes("030000004c050000e60c000000000000"), "no USB DualSense mapping");
  assert.ok(guids.includes("050000004c050000e60c000000000000"), "no Bluetooth DualSense mapping");
});

test("every shipped mapping is a well-formed SDL line", () => {
  for (const line of CONTROLLER_MAPPINGS) {
    assert.ok(mappingGuid(line), `no 32-hex GUID at the head of: ${line.slice(0, 40)}`);
    // The engine needs both sticks and the face buttons to be useful.
    for (const field of ["leftx:", "lefty:", "rightx:", "righty:", "a:", "b:", "platform:"]) {
      assert.ok(line.includes(field), `mapping is missing ${field}`);
    }
    assert.ok(line.split(",").length > 15, "mapping looks truncated");
  }
});

test("a comment or blank line is not mistaken for a mapping", () => {
  assert.equal(mappingGuid("# a comment"), null);
  assert.equal(mappingGuid(""), null);
  assert.equal(mappingGuid(null), null);
  assert.equal(mappingGuid("not-a-guid,Name,a:b1,"), null);
});

test("an empty database gets both mappings", () => {
  assert.deepEqual(missingControllerMappings(""), CONTROLLER_MAPPINGS);
  const out = withControllerMappings("", CONTROLLER_MAPPINGS);
  for (const line of CONTROLLER_MAPPINGS) assert.ok(out.includes(line));
});

test("an existing database keeps every line it already had", () => {
  const existing = "# upstream db\n030000005e0400008e02000014010000,Xbox 360 Controller,a:b0,platform:Windows,\n";
  const out = withControllerMappings(existing, missingControllerMappings(existing));
  assert.ok(out.includes("030000005e0400008e02000014010000"), "dropped an existing mapping");
  assert.ok(out.includes("# upstream db"), "dropped an existing comment");
  for (const line of CONTROLLER_MAPPINGS) assert.ok(out.includes(line));
});

test("adding is idempotent — a second pass writes nothing", () => {
  const once = withControllerMappings("", CONTROLLER_MAPPINGS);
  assert.deepEqual(missingControllerMappings(once), []);
  assert.equal(withControllerMappings(once, []), once);
});

test("a player's own mapping for the same pad is left alone", () => {
  /*
   * SDL takes the first match, and theirs is already an answer to the question
   * this feature exists to answer — so match on GUID, not on the whole line.
   */
  const mine = "030000004c050000e60c000000000000,My Tuned DualSense,a:b1,leftx:a0,platform:Windows,\n";
  const missing = missingControllerMappings(mine);
  assert.equal(missing.length, 1, "should only be missing the Bluetooth line");
  assert.equal(mappingGuid(missing[0]), "050000004c050000e60c000000000000");
});

test("GUID matching ignores case and surrounding whitespace", () => {
  const upper = "  030000004C050000E60C000000000000,PS5,a:b1,platform:Windows,  \n";
  assert.equal(missingControllerMappings(upper).length, 1);
});
