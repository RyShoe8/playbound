"use strict";

/**
 * Daggerfall's freeware game data, built on the player's machine.
 *
 * Bethesda released Daggerfall free as DFInstall.zip: the contents of the 1996
 * CD plus a DOS installer. The CD does not hold ARCH3D.BSA (the 3D models) or
 * DAGGER.SND (the sound effects) as files. They sit inside PACKED.DAT, and the
 * DOS installer unpacks them onto the hard drive. Daggerfall Unity and DFO
 * Online both refuse an ARENA2 folder that lacks them, so a straight copy of the
 * CD is not enough.
 *
 * Bethesda's licence for that download is personal and non-transferable, so
 * PlayBound does not host the data. The launcher fetches Bethesda's own zip from
 * Bethesda's own server and performs the same unpack the DOS installer would,
 * here.
 *
 * PACKED.DAT layout (worked out from the file; the format is undocumented):
 *   - an 8-byte header, then a run of blocks;
 *   - each block is 8 bytes of repeated header, five u32 (uncompressed size,
 *     compressed size, compressed size again, uncompressed size again, a
 *     constant), 8 more bytes, then a PKWARE DCL ("implode") stream;
 *   - the blocks decode to one stream, ARCH3D.BSA followed by DAGGER.SND;
 *   - after the last block, a footer names the two files and their sizes.
 */

const REQUIRED_ARENA2 = Object.freeze([
  "ARCH3D.BSA",
  "BLOCKS.BSA",
  "MAPS.BSA",
  "MONSTER.BSA",
  "WOODS.WLD",
  "TEXT.RSC",
  "ART_PAL.COL",
]);

/** Where PACKED.DAT splits. Fixed: it is a fixed file in a fixed download. */
const PACKED_FILES = Object.freeze([
  { name: "ARCH3D.BSA", size: 27143532 },
  { name: "DAGGER.SND", size: 7661766 },
]);

const BLOCK_HEADER = 36;
const FIRST_BLOCK = 8;

// ---- PKWARE DCL explode (after Mark Adler's public-domain blast.c) ----------

const LITLEN = [
  11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8, 9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12,
  11, 7, 9, 11, 12, 6, 7, 22, 5, 7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12, 8, 12, 5,
  38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27, 44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12,
  45, 12, 61, 12, 45, 44, 173,
];
const LENLEN = [2, 35, 36, 53, 38, 23];
const DISTLEN = [2, 20, 53, 230, 247, 151, 248];
const BASE = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264];
const EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];

function buildHuffman(rep) {
  const lengths = [];
  for (const r of rep) {
    const len = r & 15;
    const n = (r >> 4) + 1;
    for (let i = 0; i < n; i += 1) lengths.push(len);
  }
  const count = new Array(16).fill(0);
  for (const l of lengths) count[l] += 1;
  const offs = new Array(16).fill(0);
  for (let l = 1; l < 15; l += 1) offs[l + 1] = offs[l] + count[l];
  const symbol = new Array(lengths.length).fill(0);
  lengths.forEach((l, sym) => {
    if (l) {
      symbol[offs[l]] = sym;
      offs[l] += 1;
    }
  });
  return { count, symbol };
}

const LIT = buildHuffman(LITLEN);
const LEN = buildHuffman(LENLEN);
const DIST = buildHuffman(DISTLEN);

/**
 * Decode one DCL stream starting at `start`.
 * @returns {{ out: Buffer, end: number }} the data and the offset just past the stream
 */
function explode(buf, start, expectedSize) {
  let pos = start;
  let bitbuf = 0;
  let bitcnt = 0;

  const bits = (need) => {
    let val = bitbuf;
    while (bitcnt < need) {
      if (pos >= buf.length) throw new Error("DCL stream ended early");
      val |= buf[pos] << bitcnt;
      pos += 1;
      bitcnt += 8;
    }
    bitbuf = val >>> need;
    bitcnt -= need;
    return val & ((1 << need) - 1);
  };

  const decode = (h) => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length <= 15; length += 1) {
      code |= bits(1) ^ 1;
      const count = h.count[length];
      if (code < first + count) return h.symbol[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error("bad DCL code");
  };

  const lit = bits(8);
  const dictBits = bits(8);
  if (lit > 1 || dictBits < 4 || dictBits > 6) throw new Error("not a DCL stream");

  const out = expectedSize ? Buffer.allocUnsafe(expectedSize) : Buffer.allocUnsafe(1 << 20);
  let outLen = 0;
  const grow = (need) => {
    if (outLen + need <= out.length) return out;
    throw new Error("DCL output larger than declared");
  };

  for (;;) {
    if (bits(1)) {
      const sym = decode(LEN);
      const length = BASE[sym] + bits(EXTRA[sym]);
      if (length === 519) break;
      const shift = length === 2 ? 2 : dictBits;
      let dist = decode(DIST) << shift;
      dist += bits(shift);
      dist += 1;
      if (dist > outLen) throw new Error("DCL distance too far back");
      grow(length);
      for (let i = 0; i < length; i += 1) {
        out[outLen] = out[outLen - dist];
        outLen += 1;
      }
    } else {
      const sym = lit ? decode(LIT) : bits(8);
      grow(1);
      out[outLen] = sym;
      outLen += 1;
    }
  }
  return { out: out.subarray(0, outLen), end: pos };
}

/**
 * Unpack PACKED.DAT into the files the DOS installer would write.
 * @param {Buffer} data the whole PACKED.DAT
 * @returns {{ name: string, data: Buffer }[]}
 */
function unpackPackedDat(data) {
  if (data.length < FIRST_BLOCK + BLOCK_HEADER) throw new Error("PACKED.DAT is too short");
  // The first u32 is where the block run ends and the footer begins.
  const blocksEnd = data.readUInt32LE(0);
  if (blocksEnd > data.length) throw new Error("PACKED.DAT header is not valid");

  const total = PACKED_FILES.reduce((n, f) => n + f.size, 0);
  const stream = Buffer.allocUnsafe(total);
  let written = 0;
  let pos = FIRST_BLOCK;
  while (pos < blocksEnd) {
    const unc = data.readUInt32LE(pos + 8);
    const comp = data.readUInt32LE(pos + 12);
    if (unc !== data.readUInt32LE(pos + 20) || comp !== data.readUInt32LE(pos + 16)) {
      throw new Error("PACKED.DAT block header is not consistent");
    }
    const start = pos + BLOCK_HEADER;
    const { out, end } = explode(data, start, unc);
    if (out.length !== unc || end !== start + comp) throw new Error("PACKED.DAT block did not decode cleanly");
    if (written + unc > total) throw new Error("PACKED.DAT holds more data than expected");
    out.copy(stream, written);
    written += unc;
    pos = start + comp;
  }
  if (written !== total) throw new Error(`PACKED.DAT unpacked to ${written} bytes, expected ${total}`);

  const files = [];
  let offset = 0;
  for (const f of PACKED_FILES) {
    files.push({ name: f.name, data: stream.subarray(offset, offset + f.size) });
    offset += f.size;
  }
  return files;
}

/** Which of the required ARENA2 files a folder lacks (case-insensitive), or null if unreadable. */
function missingArena2(fs, dir) {
  let names;
  try {
    names = new Set(fs.readdirSync(dir).map((n) => n.toUpperCase()));
  } catch {
    return null;
  }
  return REQUIRED_ARENA2.filter((n) => !names.has(n));
}

/** Bethesda's own freeware download of Daggerfall (the 1996 CD plus its DOS installer). */
const BETHESDA_FREEWARE_URL = "https://cdnstatic.bethsoft.com/elderscrolls.com/assets/files/tes/extras/DFInstall.zip";

/** Child of `dir` whose name matches `name` in any case, or null. */
function findCaseInsensitive(fs, path, dir, name) {
  try {
    const hit = fs.readdirSync(dir).find((n) => n.toUpperCase() === name.toUpperCase());
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

function copyTree(fs, path, from, to, skip) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip && skip(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(fs, path, src, dst, null);
    else fs.copyFileSync(src, dst);
  }
}

/**
 * Build a complete ARENA2 folder in `destDir` from Bethesda's freeware download.
 *
 * Downloads DFInstall.zip from Bethesda's server, copies the CD's ARENA2, then
 * unpacks ARCH3D.BSA and DAGGER.SND out of PACKED.DAT (the step the DOS
 * installer performs). Nothing here is hosted by PlayBound.
 *
 * Note the result is the data as the CD shipped it: Bethesda's later 1.07.213
 * patch (a DOS program) is not applied.
 *
 * @param {string} destDir ARENA2 folder to create or complete
 * @param {object} deps injected so this stays testable
 */
async function installFreewareArena2(destDir, { fs, path, tmpdir, download, extractArchive, progress = () => {}, patch = null }) {
  const work = fs.mkdtempSync(path.join(tmpdir, "pb-daggerfall-"));
  try {
    const zip = path.join(work, "DFInstall.zip");
    progress({ phase: "downloading", addon: "Daggerfall game data (Bethesda freeware release)" });
    await download(BETHESDA_FREEWARE_URL, zip);

    progress({ phase: "extracting", addon: "Daggerfall game data" });
    const unpacked = path.join(work, "x");
    await extractArchive(zip, unpacked);

    const dfcd = findCaseInsensitive(fs, path, unpacked, "DFCD");
    const dagger = dfcd && findCaseInsensitive(fs, path, dfcd, "DAGGER");
    const arena2 = dagger && findCaseInsensitive(fs, path, dagger, "ARENA2");
    if (!arena2) throw new Error("The Daggerfall download does not contain the expected ARENA2 folder");

    const packedPath = findCaseInsensitive(fs, path, arena2, "PACKED.DAT");
    if (!packedPath) throw new Error("The Daggerfall download does not contain PACKED.DAT");

    progress({ phase: "installing", addon: "Daggerfall game data" });
    copyTree(fs, path, arena2, destDir, (name) => name.toUpperCase() === "PACKED.DAT");
    for (const file of unpackPackedDat(fs.readFileSync(packedPath))) {
      fs.writeFileSync(path.join(destDir, file.name), file.data);
    }

    // Bethesda's 1.07.213 update, when a way to run it is available.
    if (patch) {
      const patchExe = findCaseInsensitive(fs, path, unpacked, "DAGGER") && findCaseInsensitive(fs, path, findCaseInsensitive(fs, path, unpacked, "DAGGER"), "DAG213.EXE");
      const fallExe = findCaseInsensitive(fs, path, dagger, "FALL.EXE");
      if (patchExe && fallExe) {
        try {
          progress({ phase: "installing", addon: "Daggerfall 1.07.213 update" });
          await patch(destDir, patchExe, fallExe);
        } catch (err) {
          // The data is complete and playable without it; say so and carry on.
          console.warn("[daggerfall] 1.07.213 update skipped:", err?.message || err);
        }
      }
    }

    const missing = missingArena2(fs, destDir);
    if (!missing || missing.length) {
      throw new Error(`Daggerfall game data is incomplete (missing ${(missing || REQUIRED_ARENA2).join(", ")})`);
    }
    return { dir: destDir };
  } finally {
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
      /* temp cleanup is best effort */
    }
  }
}

/**
 * Apply Bethesda's 1.07.213 update to an ARENA2 folder.
 *
 * The update (DAG213.EXE, in the same freeware download) is a DOS program. It
 * unpacks the revised quest, text and data files, then chains into FIXMAPS,
 * which wants the original CD and prompts forever without one. The revised
 * files are written before that point, so this runs the patch in DOSBox against
 * a scratch folder, waits until the files stop appearing, ends DOSBox, and
 * copies the revised ARENA2 files over `destDir`. The map fix (duplicate town
 * names) is the one part that is skipped.
 *
 * @param {string} destDir ARENA2 folder to update
 * @param {string} patchExe path to DAG213.EXE
 * @param {string} fallExe path to the CD's FALL.EXE; the patch refuses a folder that lacks it
 * @param {object} deps { fs, path, tmpdir, dosBoxBinary, spawn, sleep, timeoutMs }
 * @returns {Promise<{ updated: number }>}
 */
async function applyDaggerfallPatch(destDir, patchExe, fallExe, deps) {
  const { fs, path, tmpdir, dosBoxBinary, spawn, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), timeoutMs = 300000 } = deps;
  const work = fs.mkdtempSync(path.join(tmpdir, "pb-dag213-"));
  let child = null;
  try {
    const daggerDir = path.join(work, "DAGGER");
    const arena2 = path.join(daggerDir, "ARENA2");
    fs.mkdirSync(arena2, { recursive: true });
    fs.copyFileSync(patchExe, path.join(daggerDir, "DAG213.EXE"));
    fs.copyFileSync(fallExe, path.join(daggerDir, "FALL.EXE"));
    fs.writeFileSync(path.join(work, "ANSWERS.TXT"), "y\r\nY\r\nY\r\nY\r\nY\r\nY\r\n");
    const conf = path.join(work, "dosbox.conf");
    fs.writeFileSync(
      conf,
      [
        "[sdl]",
        "fullscreen=false",
        "[dosbox]",
        "memsize=32",
        "[cpu]",
        "cycles=max",
        "[autoexec]",
        `mount c "${work}" -freesize 1000`,
        "c:",
        "cd \\dagger",
        "dag213 < c:\\answers.txt > nul",
        "exit",
        "",
      ].join("\r\n")
    );

    child = spawn(dosBoxBinary, ["-noprimaryconf", "-conf", conf], { stdio: "ignore", windowsHide: true });
    const exited = new Promise((resolve) => child.on("exit", resolve));

    const countFiles = () => {
      try {
        return fs.readdirSync(arena2).length;
      } catch {
        return 0;
      }
    };
    const started = Date.now();
    let last = -1;
    let stableFor = 0;
    // Done once the version note exists and the file count has stopped changing.
    while (Date.now() - started < timeoutMs) {
      await sleep(1000);
      const n = countFiles();
      const marker = fs.existsSync(path.join(daggerDir, "PATCHED.TXT"));
      if (marker && n > 0 && n === last) stableFor += 1;
      else stableFor = 0;
      last = n;
      if (stableFor >= 4) break;
    }
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    await Promise.race([exited, sleep(5000)]);

    const patched = fs.readdirSync(arena2);
    if (!patched.length || !fs.existsSync(path.join(daggerDir, "PATCHED.TXT"))) {
      throw new Error("The Daggerfall update did not run to completion");
    }
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of patched) {
      const from = path.join(arena2, name);
      if (fs.statSync(from).isFile()) fs.copyFileSync(from, path.join(destDir, name));
    }
    return { updated: patched.length };
  } finally {
    try {
      if (child) child.kill();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

module.exports = {
  REQUIRED_ARENA2,
  PACKED_FILES,
  BETHESDA_FREEWARE_URL,
  explode,
  unpackPackedDat,
  missingArena2,
  installFreewareArena2,
  applyDaggerfallPatch,
};
