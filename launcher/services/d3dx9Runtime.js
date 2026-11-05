"use strict";

/**
 * Games that need Microsoft's d3dx9_43.dll beside them.
 *
 * Windows ships Direct3D 9 but not this helper library, and Boll Deluxe 2.1.5+
 * shows visual errors or crashes without it; its developers say they forgot to
 * bundle it and suggest copying the DLL into the game folder. Rather than send
 * the player to a DirectX installer (and a UAC prompt), take that one file from
 * Microsoft's signed redistributable, pinned by hash, and place it beside the
 * game. The 100 MB package is only fetched on a machine that lacks the DLL.
 *
 * This can never stop a game launching: the caller treats failure as a warning.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const D3DX9_GAMES = new Set(["boll-deluxe"]);
const REDIST_URL =
  "https://download.microsoft.com/download/8/4/A/84A35BF1-DAFE-4AE8-82AF-AD2AE20B6B14/directx_Jun2010_redist.exe";
const REDIST_SHA256 = "053f76dcbb28802e23341b6a787e3b0791c0fa5c8d4d011b1044172dbf89c73b";
const DLL_SHA256 = "0b28546be22c71834501f7d7185ede5d79742457331c7ee09efc14490dd64f5f";
const CAB = "Jun2010_d3dx9_43_x86.cab";
const DLL = "d3dx9_43.dll";

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** These games are 32-bit, so Windows' copy would be in SysWOW64. */
function needsD3dx9(slug, gameDir, { platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  if (platform !== "win32" || !D3DX9_GAMES.has(slug) || !gameDir) return false;
  if (exists(path.join(gameDir, DLL))) return false;
  const windir = env.WINDIR || env.windir || "C:\\Windows";
  return !exists(path.win32.join(windir, "SysWOW64", DLL));
}

/**
 * Put the DLL beside the game. `download(url, dest)` and `extract(archive, name, dir)`
 * are injected; `workDir` is a fresh temporary directory the caller may discard.
 */
async function installD3dx9(gameDir, { workDir, download, extract }) {
  fs.mkdirSync(workDir, { recursive: true });
  const redist = path.join(workDir, "directx_Jun2010_redist.exe");
  await download(REDIST_URL, redist);
  if (sha256File(redist) !== REDIST_SHA256) throw new Error("DirectX package checksum mismatch");
  await extract(redist, CAB, workDir);
  await extract(path.join(workDir, CAB), DLL, workDir);
  const extracted = path.join(workDir, DLL);
  if (sha256File(extracted) !== DLL_SHA256) throw new Error("d3dx9_43.dll checksum mismatch");
  fs.copyFileSync(extracted, path.join(gameDir, DLL));
}

module.exports = { D3DX9_GAMES, REDIST_URL, REDIST_SHA256, DLL_SHA256, CAB, DLL, needsD3dx9, installD3dx9 };
