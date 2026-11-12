"use strict";

const fs = require("fs");
const fsp = require("fs/promises");

/*
 * Windows refuses a folder rename (EPERM/EACCES/EBUSY) while any file inside it
 * is open, and antivirus or the search indexer opens freshly extracted files
 * for a few seconds. One attempt turned that into INSTALL_FAILED for a player
 * whose folder would have moved a moment later (Luanti, 0.3.230). Retry with a
 * growing wait; when the destination is free, fall back to copy-then-delete,
 * which a scanner's read handle does not block.
 */
const RENAME_RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

async function renameWithRetry(from, to, { attempts = 8, firstDelayMs = 150, copyFallback = false, rename = fsp.rename, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let delay = firstDelayMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (err) {
      if (!RENAME_RETRY_CODES.has(err?.code)) throw err;
      if (attempt < attempts) {
        await wait(delay);
        delay = Math.min(delay * 2, 3000);
        continue;
      }
      if (!copyFallback || fs.existsSync(to)) throw err;
      console.warn(`[install] rename still blocked (${err.code}); copying ${from} -> ${to} instead`);
      try {
        await fsp.cp(from, to, { recursive: true, errorOnExist: true, force: false });
      } catch (copyErr) {
        await fsp.rm(to, { recursive: true, force: true }).catch(() => {});
        throw err;
      }
      // The copy is complete; a staging folder that cannot be removed yet is
      // only stale space and is cleared on the next install.
      await fsp.rm(from, { recursive: true, force: true }).catch((rmErr) =>
        console.warn(`[install] left ${from} behind:`, rmErr?.message || rmErr));
      return undefined;
    }
  }
}

module.exports = { renameWithRetry, RENAME_RETRY_CODES };
