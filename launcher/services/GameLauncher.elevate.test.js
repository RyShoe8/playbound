/**
 * Quoting for the elevated-launch command.
 *
 * A game marked needsAdmin is started through `powershell -Command
 * Start-Process ... -Verb RunAs`, because ShellExecute is the only Windows API
 * that can raise privileges. That means an install path ends up inside a
 * PowerShell script, and a quoting mistake there is arbitrary command
 * execution rather than a cosmetic bug.
 *
 * Install paths routinely contain spaces, and game folders contain
 * apostrophes ("Rock 'n' Roll Racing", "Dungeon Keeper: Deeper Dungeons").
 * Inside a single-quoted PowerShell literal the only escape is a doubled
 * quote, and backslashes are literal — which is exactly what makes it the
 * right quoting style for Windows paths.
 */

"use strict";

const assert = require("assert");
const { buildElevatedStartProcess, psQuote } = require("./GameLauncher");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}

test("wraps a value in single quotes", () => {
  assert.strictEqual(psQuote("simple"), "'simple'");
});

test("leaves Windows backslashes alone", () => {
  // Single-quoted PowerShell does not process escapes, so a path survives
  // verbatim. Doubling them here would break every path.
  assert.strictEqual(psQuote("C:\\Games\\Foo\\bar.exe"), "'C:\\Games\\Foo\\bar.exe'");
});

test("doubles apostrophes rather than escaping them", () => {
  assert.strictEqual(psQuote("Rock 'n' Roll"), "'Rock ''n'' Roll'");
  assert.strictEqual(psQuote("it's"), "'it''s'");
});

test("cannot be broken out of with a quote", () => {
  // The attack: a folder named so the literal closes early and the rest is
  // read as commands.
  const evil = "C:\\Games\\x'; Remove-Item C:\\ -Recurse; '";
  const quoted = psQuote(evil);
  assert.ok(quoted.startsWith("'") && quoted.endsWith("'"));
  // Every inner quote is doubled, so none of them terminates the literal.
  const inner = quoted.slice(1, -1);
  assert.ok(!/(^|[^'])'([^']|$)/.test(inner), `unpaired quote survived: ${quoted}`);
});

test("builds a Start-Process command that elevates and waits", () => {
  const cmd = buildElevatedStartProcess("C:\\Games\\MS\\msawminloader.exe", [], "C:\\Games\\MS");
  assert.ok(cmd.includes("-Verb RunAs"), "must elevate");
  // Without -Wait the PowerShell process exits at once and the early-exit
  // watch reports a launch failure for a game that started fine.
  assert.ok(cmd.includes("-Wait"), "must wait for the game to exit");
  assert.ok(cmd.includes("'C:\\Games\\MS\\msawminloader.exe'"), "path must be quoted verbatim");
  assert.ok(cmd.includes("-WorkingDirectory 'C:\\Games\\MS'"));
  assert.ok(!cmd.includes("-ArgumentList"), "no args means no ArgumentList");
});

test("passes arguments as a quoted, comma-separated list", () => {
  const cmd = buildElevatedStartProcess("C:\\g\\a.exe", ["+connect", "1.2.3.4:27015"], "C:\\g");
  assert.ok(cmd.includes("-ArgumentList '+connect','1.2.3.4:27015'"), cmd);
});

test("quotes a path containing spaces and an apostrophe", () => {
  const cmd = buildElevatedStartProcess(
    "C:\\Games\\Rock 'n' Roll\\game.exe",
    ["-windowed"],
    "C:\\Games\\Rock 'n' Roll"
  );
  assert.ok(cmd.includes("'C:\\Games\\Rock ''n'' Roll\\game.exe'"), cmd);
  assert.ok(cmd.includes("-WorkingDirectory 'C:\\Games\\Rock ''n'' Roll'"), cmd);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
