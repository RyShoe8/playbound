/**
 * In-place OpenBOR .pak edits that keep directory offsets valid.
 *
 * OpenBOR packs end with a file table; each entry's filestart/filesize must
 * stay true. Replacing a scene with a shorter script is fine if we pad to the
 * original byte length so later files do not move.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const PACK_MAGIC = Buffer.from("PACK");

/** Parse the trailing directory. Returns Map<normalizedName, { start, size, rawName }>. */
function readPackIndex(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  if (buf.slice(0, 4).compare(PACK_MAGIC) !== 0) return null;
  const headerStart = buf.readUInt32LE(buf.length - 4);
  if (headerStart <= 0 || headerStart >= buf.length - 4) return null;

  const files = new Map();
  let pos = headerStart;
  const end = buf.length - 4;
  while (pos + 12 <= end) {
    const structSize = buf.readUInt32LE(pos);
    if (structSize < 12 || pos + structSize > buf.length) break;
    const fileStart = buf.readUInt32LE(pos + 4);
    const fileSize = buf.readUInt32LE(pos + 8);
    const rawName = buf.slice(pos + 12, pos + structSize).toString("latin1").split("\0")[0];
    const key = rawName.replace(/\\/g, "/").toLowerCase();
    files.set(key, { start: fileStart, size: fileSize, rawName });
    pos += structSize;
  }
  return files;
}

/**
 * Overwrite one packed file when the replacement fits in the original size.
 * Returns { changed: boolean, reason?: string }.
 */
function replacePackFile(buf, logicalPath, nextBytes) {
  const files = readPackIndex(buf);
  if (!files) return { changed: false, reason: "not-a-pack" };
  const key = String(logicalPath || "")
    .replace(/\\/g, "/")
    .toLowerCase();
  const entry = files.get(key);
  if (!entry) return { changed: false, reason: "missing" };
  if (!Buffer.isBuffer(nextBytes)) nextBytes = Buffer.from(String(nextBytes), "latin1");
  if (nextBytes.length > entry.size) {
    return { changed: false, reason: "too-large" };
  }
  const padded = Buffer.alloc(entry.size, 0x20); // spaces — ignored after the scene ends
  nextBytes.copy(padded, 0);
  if (buf.slice(entry.start, entry.start + entry.size).equals(padded)) {
    return { changed: false, reason: "already" };
  }
  padded.copy(buf, entry.start);
  return { changed: true };
}

/**
 * TMNT Rescue-Palooza boots through scenes/logo.txt, which plays a long
 * support.gif cross-promo for Merso's other demos before the title. Keep the
 * short OpenBOR warning frame; drop the ad + mersox logo reel.
 */
const TMNT_LOGO_SCENE =
  "# PlayBound: skip cross-promo / long boot logos\r\n" +
  "animation\tdata/bgs/openbor_warning.gif 0 0 1 0\r\n";

function findTmntPak(installDir) {
  if (!installDir) return null;
  const candidates = [
    path.join(installDir, "Paks", "TMNT_RP_1_1_5.pak"),
    path.join(installDir, "TMNT Rescue-Palooza 1.15", "Paks", "TMNT_RP_1_1_5.pak"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Strip TMNT boot ads from the install's pak. Idempotent.
 */
async function stripTmntBootAds(installDir) {
  const pakPath = findTmntPak(installDir);
  if (!pakPath) return { changed: false, reason: "pak-missing" };
  const buf = Buffer.from(await fsp.readFile(pakPath));
  const result = replacePackFile(buf, "data/scenes/logo.txt", Buffer.from(TMNT_LOGO_SCENE, "latin1"));
  if (!result.changed) return { ...result, pakPath };
  await fsp.writeFile(pakPath, buf);
  return { ...result, pakPath };
}

module.exports = {
  readPackIndex,
  replacePackFile,
  findTmntPak,
  stripTmntBootAds,
  TMNT_LOGO_SCENE,
};
