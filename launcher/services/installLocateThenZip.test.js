const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function fn(name) {
  const start =
    MAIN.indexOf(`\nasync function ${name}(`) + 1 ||
    MAIN.indexOf(`\nfunction ${name}(`) + 1;
  assert.ok(start > 0, `${name} not found — main.js has been restructured`);
  let i = MAIN.indexOf("{", start);
  let d = 0;
  for (; i < MAIN.length; i += 1) {
    if (MAIN[i] === "{") d += 1;
    else if (MAIN[i] === "}") {
      d -= 1;
      if (d === 0) break;
    }
  }
  return MAIN.slice(start, i + 1);
}

test("installLocateThenZip checks loadState for existing base game install before prompting", () => {
  const body = fn("installLocateThenZip");
  assert.match(
    body,
    /loadState\(\)/,
    "installLocateThenZip must read existing state to find already-located base games"
  );
  assert.match(
    body,
    /DEFAULT_EDITION_SLUG/,
    "installLocateThenZip must check official/default base edition directory"
  );
  assert.match(
    body,
    /dialog\.showOpenDialog/,
    "installLocateThenZip must still prompt when no base game install is known"
  );
});

test("installLocateThenZip supports baseExeHint separate from target exeHint", () => {
  const body = fn("installLocateThenZip");
  assert.match(
    body,
    /entry\.baseExeHint/,
    "installLocateThenZip must respect entry.baseExeHint"
  );
  assert.match(
    body,
    /findExecutable\(gameDir,\s*targetExeHint\)/,
    "installLocateThenZip must look for the target edition exe, not just baseExeHint"
  );
});

test("installLocateThenZip merges nested GAME folder if overlay contains one", () => {
  const body = fn("installLocateThenZip");
  assert.match(
    body,
    /nestedGame/,
    "installLocateThenZip must merge nested GAME folder from overlay into gameDir"
  );
  assert.doesNotMatch(body, /nestedGame\s*&&\s*!findExecutable/);
  assert.match(body, /Data",\s*"interfac\.drs"/);
});

test("an explicit edition launch cannot fall back to another installed edition", () => {
  const body = fn("playGameInner");
  assert.match(body, /!editionSlug\s*&&\s*!exeOnDisk\(info\)\s*&&\s*exeOnDisk\(game\)/);
  assert.match(body, /!editionSlug\s*&&\s*!exeOnDisk\(info\)\s*&&\s*game\.editions/);
});

test("the official GOG SWGB edition uses its player.exe launch contract", () => {
  const body = fn("playGameInner");
  assert.match(body, /star-wars-galactic-battlegrounds-saga/);
  assert.match(body, /player\.exe/);
  assert.match(body, /xlogo1\.avi.*xintro\.avi.*battlegrounds_x1\.exe/s);
});
