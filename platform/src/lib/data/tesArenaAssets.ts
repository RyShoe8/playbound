/**
 * The Elder Scrolls: Arena freeware assets + OpenTESArena overlay.
 *
 * Bethesda's 2004 1.06 package is a zip wrapping Arena106.exe, a WinRAR SFX
 * that 7za cannot open. PlayBound therefore ships an extracted GameFiles zip
 * (ARENA/A.EXE at ARENA/A.EXE) and keeps a verbatim copy of the original
 * setup on the VPS so the freeware is not lost if Bethesda's CDN moves.
 */

export const TES_ARENA_SLUG = "tes-arena";
export const OPENTESARENA_EDITION_SLUG = "opentesarena";

export const ARENA_FREEWARE_SETUP_URL =
  "https://cdnstatic.bethsoft.com/elderscrolls.com/assets/files/tes/extras/Arena106Setup.zip";
export const ARENA_FREEWARE_SETUP_FILE = "Arena106Setup.zip";
export const ARENA_FREEWARE_SFX_FILE = "Arena106.exe";

export const ARENA_GAMEFILES_FILE = "Arena-1.06-GameFiles.zip";
export const ARENA_GAMEFILES_MIRROR_PATH = `launcher-packages/games/${TES_ARENA_SLUG}/${ARENA_GAMEFILES_FILE}`;
export const ARENA_SETUP_MIRROR_PATH = `launcher-packages/games/${TES_ARENA_SLUG}/original/${ARENA_FREEWARE_SETUP_FILE}`;

const BLOB_BASE = "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com";
const MIRROR_BASE = "https://mirror.playbound.club";

/** Public download used by launcher recipes (same Blob host as ET's data pack). */
export const ARENA_GAMEFILES_URL = `${BLOB_BASE}/${ARENA_GAMEFILES_MIRROR_PATH}`;
/** Verbatim Bethesda zip, staged next to the extracted tree. */
export const ARENA_SETUP_ARCHIVE_URL = `${BLOB_BASE}/${ARENA_SETUP_MIRROR_PATH}`;
/** Intended VPS paths; archive-tes-arena-assets.ts copies Blob → game-host. */
export const ARENA_GAMEFILES_VPS_URL = `${MIRROR_BASE}/${ARENA_GAMEFILES_MIRROR_PATH}`;
export const ARENA_SETUP_MIRROR_URL = `${MIRROR_BASE}/${ARENA_SETUP_MIRROR_PATH}`;

/** OpenTESArena searches these relative to the engine exe. */
export const OPENTESARENA_OVERLAY_DEST = "data";

export const TES_ARENA_EXE_HINT = "A.EXE";
export const OPENTESARENA_EXE_HINT = "otesa.exe";

export const TES_ARENA_KNOWN_EXE_PATHS = ["ARENA/A.EXE", "A.EXE"];
export const OPENTESARENA_KNOWN_EXE_PATHS = ["otesa.exe"];
