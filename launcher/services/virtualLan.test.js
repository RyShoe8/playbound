const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { findCli } = require("./virtualLan");

test("findCli returns null when NetBird is not installed (no bare name)", () => {
  const prevPath = process.env.PATH;
  const prevLocal = process.env.LOCALAPPDATA;
  const prevPf = process.env.ProgramFiles;
  const prevPf86 = process.env["ProgramFiles(x86)"];
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "pb-nobird-"));
  try {
    process.env.PATH = empty;
    process.env.LOCALAPPDATA = empty;
    process.env.ProgramFiles = empty;
    process.env["ProgramFiles(x86)"] = empty;
    // Re-require would cache — findCli reads env each call, so this is enough.
    assert.equal(findCli(), null);
  } finally {
    process.env.PATH = prevPath;
    process.env.LOCALAPPDATA = prevLocal;
    process.env.ProgramFiles = prevPf;
    process.env["ProgramFiles(x86)"] = prevPf86;
    try {
      fs.rmSync(empty, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});
