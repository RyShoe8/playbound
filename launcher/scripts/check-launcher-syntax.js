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
 *   3. Parsing is not loading. services/openraNat.js exported a function that
 *      had been deleted in a rename; the file is perfectly valid JavaScript,
 *      so every check above passed it, and requiring it threw ReferenceError.
 *      main.js requires it at the top level, so the launcher did not start at
 *      all — and it shipped. Modules under services/ are therefore required in
 *      a child process as well as parsed, which is the only way an error that
 *      exists solely at evaluation can be seen before a user sees it.
 *
 * Keep CommonJS entrypoints on the plain path: main.js uses require() and is
 * not a module, so module parsing would reject it for the opposite reason.
 * They are also parse-only for (3): bootstrap/main/preload reach for
 * contextBridge and process.versions.electron as they load, so requiring them
 * outside Electron fails for reasons that say nothing about the code. Loading
 * services/ is what covers them in practice, since that is what they require.
 */

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const launcherDir = path.join(__dirname, "..");

/** CommonJS entrypoints — parsed as scripts. */
const COMMONJS_FILES = ["bootstrap.js", "main.js", "preload.js"];

/** Directories whose .js/.mjs files are ES modules. */
const MODULE_DIRS = ["renderer"];

/** CommonJS directories that are required, not just parsed. See (3) above. */
const LOAD_DIRS = ["services"];

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

/*
 * Load check. Test files are excluded because requiring one runs its
 * assertions, which is the job of the test: scripts, not of a packaging gate.
 */
const loadFiles = [];
for (const dir of LOAD_DIRS) {
  collectModuleFiles(path.join(launcherDir, dir), loadFiles);
}
const loadable = loadFiles.filter((f) => !/\.test\.js$/.test(f) && /\.js$/.test(f));

for (const fullPath of loadable) {
  const result = spawnSync(process.execPath, ["-e", "require(process.argv[1])", fullPath], {
    cwd: launcherDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`\n[check-launcher-syntax] FAILED TO LOAD: ${path.relative(launcherDir, fullPath)}`);
    console.error((result.stderr || "").trimEnd());
  }
}

/*
 * Undefined-name check. The one thing neither parsing nor loading can see.
 *
 * `isJar` in a launch error handler and `mainWindow` in the notification click
 * handler were both references to names that do not exist. Both files parse,
 * so --check passed them; both sit inside a function only some paths reach, so
 * requiring the module passed them too. They failed at the worst possible
 * moment instead — while reporting a launch failure, and when a player clicked
 * a party invite.
 *
 * ESLint comes from platform/, which the launcher does not depend on, so a
 * checkout with only launcher deps installed skips this with a notice rather
 * than failing a build over a tool it was never given.
 */
// The JS entrypoint rather than the .bin shim: a .cmd needs shell:true on
// Windows, and passing args through a shell is both a deprecation warning and
// a quoting hazard for paths with spaces.
const eslintBin = path.join(
  launcherDir,
  "..",
  "platform",
  "node_modules",
  "eslint",
  "bin",
  "eslint.js"
);
const eslintConfig = path.join(launcherDir, "eslint.config.mjs");

if (fs.existsSync(eslintBin) && fs.existsSync(eslintConfig)) {
  const result = spawnSync(
    process.execPath,
    [eslintBin, "--no-config-lookup", "--config", eslintConfig, "."],
    { cwd: launcherDir, encoding: "utf8" }
  );
  if (result.status !== 0) {
    failed += 1;
    console.error("\n[check-launcher-syntax] undefined names found:");
    console.error((result.stdout || result.stderr || "").trimEnd());
  }
} else {
  console.log("[check-launcher-syntax] no-undef check skipped (platform eslint not installed).");
}

if (failed > 0) {
  console.error(
    `\n[check-launcher-syntax] ${failed} file(s) failed to parse or load — not packaging.`
  );
  process.exit(1);
}

console.log(
  `[check-launcher-syntax] OK: ${COMMONJS_FILES.join(", ")} + ${moduleFiles.length} module file(s) parsed, ${loadable.length} service module(s) loaded`
);
