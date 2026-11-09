"use strict";

/**
 * Amiga Kickstart ROMs for RetroArch's PUAE core.
 *
 * PUAE's built-in AROS replacement boots many Amiga disks, but disks that boot
 * straight to the hardware with their own loader (1942 is one) can stop at
 * AROS's "insert bootable media" screen. A real Kickstart boots them. Kickstart
 * is Commodore/Cloanto's and not ours to ship, so the player supplies their own
 * — from Amiga Forever, or dumped from their own Amiga — once, and every Amiga
 * game uses it from then on. Without one, AROS remains the fallback.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const zlib = require("zlib");

/*
 * Known good dumps by CRC32, with the file name PUAE looks for in RetroArch's
 * system folder. Kickstart 1.3 is what A500-era games expect.
 */
const KNOWN_ROMS = {
  c4f0f55f: { file: "kick34005.A500", label: "Kickstart 1.3 (34.5) A500" },
  b4113910: { file: "kick40063.A600", label: "Kickstart 3.1 (40.63) A500/A600/A2000" },
  "1483a091": { file: "kick40068.A1200", label: "Kickstart 3.1 (40.68) A1200" },
};

function crc32(buffer) {
  if (typeof zlib.crc32 === "function") return (zlib.crc32(buffer) >>> 0).toString(16).padStart(8, "0");
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

/** The Kickstart ROMs present in a system folder, by label. */
function installedKickstarts(systemDir) {
  return Object.values(KNOWN_ROMS)
    .filter((rom) => {
      try { return fs.statSync(path.join(systemDir, rom.file)).isFile(); }
      catch { return false; }
    })
    .map((rom) => rom.label);
}

/** Whether a Kickstart 1.3 is in place, which is what A500 disks need. */
function hasKickstart13(systemDir) {
  try { return fs.statSync(path.join(systemDir, KNOWN_ROMS.c4f0f55f.file)).isFile(); }
  catch { return false; }
}

/**
 * Copy a player's ROM into the system folder under the name PUAE expects.
 * Only known, unencrypted dumps are accepted: a wrong or encrypted file would
 * fail at boot with no clue why. Amiga Forever's ROMs are the right ones once
 * exported unencrypted from its Kickstart folder.
 */
async function importKickstart(file, systemDir) {
  const data = await fsp.readFile(file);
  if (data.length !== 262144 && data.length !== 524288) {
    return { ok: false, error: "That file is not a Kickstart ROM (it should be 256 KB or 512 KB)." };
  }
  const rom = KNOWN_ROMS[crc32(data)];
  if (!rom) {
    return {
      ok: false,
      error: "PlayBound doesn't recognise that ROM. Use an unencrypted Kickstart 1.3 (34.5) or 3.1 dump; Amiga Forever's encrypted ROMs need to be exported unencrypted first.",
    };
  }
  await fsp.mkdir(systemDir, { recursive: true });
  await fsp.writeFile(path.join(systemDir, rom.file), data);
  return { ok: true, label: rom.label };
}

/**
 * Copy stored ROMs into RetroArch's system folder before an Amiga launch. The
 * player adds a ROM to PlayBound's own folder (RetroArch may not be downloaded
 * yet); this makes sure the copy PUAE reads is there.
 */
async function syncKickstarts(storeDir, systemDir) {
  if (!storeDir || !systemDir) return 0;
  let copied = 0;
  for (const rom of Object.values(KNOWN_ROMS)) {
    const from = path.join(storeDir, rom.file);
    const to = path.join(systemDir, rom.file);
    try {
      if (!fs.statSync(from).isFile()) continue;
    } catch {
      continue;
    }
    try {
      if (fs.statSync(to).size === fs.statSync(from).size) continue;
    } catch {
      /* not there yet */
    }
    await fsp.mkdir(systemDir, { recursive: true });
    await fsp.copyFile(from, to);
    copied++;
  }
  return copied;
}

module.exports = { KNOWN_ROMS, crc32, installedKickstarts, hasKickstart13, importKickstart, syncKickstarts };
