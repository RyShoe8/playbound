/**
 * Executable-format sniffing.
 *
 * TES: Arena's freeware package ships Bethesda's 16-bit `Arena106.exe` beside
 * the modern build. The launcher picked the DOS blob as the launch target and
 * every Play died with `spawn C:\Games\tes-arena\Arena106.exe EACCES` — no
 * message a player could act on. These cases pin the header reading that now
 * tells the two apart before anything is spawned.
 *
 * Run: node services/executableFormat.test.js
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  executableFormat,
  isLegacyDosExecutable,
  shouldLaunchThroughDosBox,
  preferRunnableExecutable,
  dosExecutableMessage,
} = require("./executableFormat");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "playbound-exefmt-"));

/** Write a fixture and return its path. */
function fixture(name, buffer) {
  const full = path.join(tmp, name);
  fs.writeFileSync(full, buffer);
  return full;
}

/**
 * An MZ image whose DOS stub points at `signature` — the shape every real
 * Windows binary has. `peOffset` null writes a header with no onward pointer,
 * which is what a plain DOS program looks like.
 */
function mzImage(signature, { peOffset = 128, stubBytes = 256 } = {}) {
  const buf = Buffer.alloc(stubBytes, 0);
  buf.write("MZ", 0, "latin1");
  if (signature) {
    buf.writeUInt32LE(peOffset, 0x3c);
    // A pointer past the end of the buffer leaves the signature unwritten on
    // purpose — that is exactly the truncated-file case.
    if (peOffset + signature.length <= stubBytes) buf.write(signature, peOffset, "latin1");
  }
  return buf;
}

test("a PE image is runnable", () => {
  assert.equal(executableFormat(fixture("modern.exe", mzImage("PE\0\0"))), "pe");
  assert.equal(isLegacyDosExecutable(fixture("modern2.exe", mzImage("PE\0\0"))), false);
});

test("a plain DOS image is legacy", () => {
  // e_lfanew left at 0: Arena106.exe's shape.
  const dos = fixture("Arena106.exe", mzImage(null));
  assert.equal(executableFormat(dos), "legacy");
  assert.equal(isLegacyDosExecutable(dos), true);
});

test("16-bit NE and DOS-extender images are legacy too", () => {
  // 64-bit Windows dropped the subsystem all of these need.
  assert.equal(executableFormat(fixture("win16.exe", mzImage("NE\0\0"))), "legacy");
  assert.equal(executableFormat(fixture("ext.exe", mzImage("LE\0\0"))), "legacy");
  assert.equal(executableFormat(fixture("lx.exe", mzImage("LX\0\0"))), "legacy");
});

test("a stub pointer past the end of the file is legacy, not a crash", () => {
  // Truncated downloads produce this; reading at the offset would throw.
  const bogus = mzImage("PE\0\0", { peOffset: 100000, stubBytes: 256 });
  assert.equal(executableFormat(fixture("truncated.exe", bogus)), "legacy");
});

test("a pointer inside the MZ header itself is legacy", () => {
  // Below 64 bytes there is no room for a second header — only DOS fields.
  const overlapping = mzImage("PE\0\0", { peOffset: 8, stubBytes: 256 });
  assert.equal(executableFormat(fixture("overlap.exe", overlapping)), "legacy");
});

test("an MZ file too short to hold e_lfanew is legacy", () => {
  assert.equal(executableFormat(fixture("stub.exe", Buffer.from("MZ", "latin1"))), "legacy");
});

test("non-Windows files are reported as such, never as legacy", () => {
  // Play must still try these: macOS and Linux binaries reach the same code.
  const elf = fixture("game", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]));
  assert.equal(executableFormat(elf), "not-windows");
  assert.equal(isLegacyDosExecutable(elf), false);

  const script = fixture("play.sh", Buffer.from("#!/bin/sh\nexec ./game\n"));
  assert.equal(executableFormat(script), "not-windows");
});

test("unreadable paths never claim to be legacy", () => {
  // A missing or locked file is the caller's problem to report; blocking a
  // launch on a failed read would turn a transient error into a dead button.
  assert.equal(executableFormat(path.join(tmp, "absent.exe")), "unreadable");
  assert.equal(executableFormat(fixture("empty.exe", Buffer.alloc(0))), "unreadable");
  assert.equal(executableFormat(""), "unreadable");
  assert.equal(executableFormat(null), "unreadable");
  assert.equal(isLegacyDosExecutable(path.join(tmp, "absent.exe")), false);
});

/** The reported install: a DOS installer outranking the real build on size. */
function arenaFolder() {
  return {
    dos: fixture("pick-Arena106.exe", mzImage(null, { stubBytes: 4096 })),
    modern: fixture("pick-OpenTESArena.exe", mzImage("PE\0\0")),
  };
}

test("selection skips a DOS image for a runnable one behind it", () => {
  const { dos, modern } = arenaFolder();
  // Size ranked the DOS blob first — the reported ordering.
  assert.equal(preferRunnableExecutable([dos, modern], { platform: "win32" }), modern);
});

test("selection keeps the caller's order when the best is already runnable", () => {
  const { dos, modern } = arenaFolder();
  assert.equal(preferRunnableExecutable([modern, dos], { platform: "win32" }), modern);
});

test("a DOS-only folder still yields a path to complain about", () => {
  // Returning null here would surface as "no executable found" instead of the
  // DOSBox explanation the player can act on.
  const { dos } = arenaFolder();
  assert.equal(preferRunnableExecutable([dos], { platform: "win32" }), dos);
});

test("selection only judges .exe and .com", () => {
  const jar = fixture("game.jar", Buffer.from("PK\u0003\u0004"));
  assert.equal(preferRunnableExecutable([jar], { platform: "win32" }), jar);
});

test("selection is a no-op off Windows", () => {
  const { dos, modern } = arenaFolder();
  // A DOS-named file on Linux or macOS is some other project's binary.
  assert.equal(preferRunnableExecutable([dos, modern], { platform: "darwin" }), dos);
  assert.equal(preferRunnableExecutable([dos, modern], { platform: "linux" }), dos);
});

test("selection handles an empty or gappy list", () => {
  assert.equal(preferRunnableExecutable([], { platform: "win32" }), null);
  assert.equal(preferRunnableExecutable(null, { platform: "win32" }), null);
  assert.equal(preferRunnableExecutable([null, ""], { platform: "win32" }), null);
});

test("the player-facing message names the file and the way out", () => {
  const msg = dosExecutableMessage("Arena106.exe");
  assert.match(msg, /Arena106\.exe/);
  assert.match(msg, /DOSBox/);
  assert.match(msg, /Locate/);
  // Still a sentence when the caller has no name to give.
  assert.match(dosExecutableMessage(""), /^This program/);
});

test("PE files are not wrapped in DOSBox even when needsDosBox is set", () => {
  const pe = fixture("otesa.exe", mzImage("PE\0\0"));
  const dos = fixture("A.EXE", mzImage(null));
  assert.equal(shouldLaunchThroughDosBox(pe), false);
  assert.equal(shouldLaunchThroughDosBox(pe, { needsDosBox: true }), false);
  assert.equal(shouldLaunchThroughDosBox(dos), true);
});

test.after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
