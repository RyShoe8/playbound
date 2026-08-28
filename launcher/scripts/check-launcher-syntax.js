"use strict";

/**
 * Parse-check every launcher script before packaging.
 *
 * Two things this exists to catch, both of which shipped to users before it
 * covered them:
 *
 *   1. The renderer was not checked at all. Only bootstrap/main/preload were,
 *      so a SyntaxError in renderer/ (twice: a duplicate `const isLeader` in
 *      views/friends.js) packaged cleanly and took out an entire screen at
 *      runtime — the module fails to parse, so nothing in it ever runs.
 *
 *   2. `node --check file.js` is the wrong tool for the renderer. Those files
 *      are ES modules, and without "type": "module" in package.json Node
 *      parses a .js path as a script — where it silently ACCEPTS the very
 *      redeclaration it would reject as a module. It passes, and the bug
 *      ships. Renderer files therefore go through --input-type=module, which
 *      does reject it.
 *
 * Keep CommonJS entrypoints on the plain path: main.js uses require() and is
 * not a module, so module parsing would reject it for the opposite reason.
 */

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const launcherDir = path.join(__dirname, "..");

/** CommonJS entrypoints — parsed as scripts. */
const COMMONJS_FILES = ["bootstrap.js", "main.js", "preload.js"];

/** Directories whose .js/.mjs files are ES modules. */
const MODULE_DIRS = ["renderer"];

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

function collectModuleFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectModuleFiles(path.join(dir, entry.name), out);
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

let failed = 0;

for (const file of COMMONJS_FILES) {
  const fullPath = path.join(launcherDir, file);
  if (!fs.existsSync(fullPath)) continue;
  const result = spawnSync(process.execPath, ["--check", fullPath], {
    cwd: launcherDir,
    stdio: "inherit",
  });
  if (result.status !== 0) failed += 1;
}

const moduleFiles = [];
for (const dir of MODULE_DIRS) {
  collectModuleFiles(path.join(launcherDir, dir), moduleFiles);
}

for (const fullPath of moduleFiles) {
  const source = fs.readFileSync(fullPath);
  /*
   * Piped through stdin because --input-type only applies to stdin/eval, not
   * to a file path. Node reports the location but calls the file [stdin], so
   * the real path is printed here.
   */
  const result = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    cwd: launcherDir,
    input: source,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`\n[check-launcher-syntax] FAILED: ${path.relative(launcherDir, fullPath)}`);
    console.error((result.stderr || "").trimEnd());
  }
}

if (failed > 0) {
  console.error(
    `\n[check-launcher-syntax] ${failed} file(s) failed to parse — not packaging.`
  );
  process.exit(1);
}

console.log(
  `[check-launcher-syntax] OK: ${COMMONJS_FILES.join(", ")} + ${moduleFiles.length} module file(s)`
);
