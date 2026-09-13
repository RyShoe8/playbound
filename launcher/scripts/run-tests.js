const { readdirSync } = require("fs");
const { join, relative } = require("path");
const { spawnSync } = require("child_process");

const root = join(__dirname, "..");
const ignored = new Set(["node_modules", "dist", "resources", "tools"]);

function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith("dist-build-")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collect(full));
    } else if (/\.test\.(?:js|mjs)$/i.test(entry.name)) {
      files.push(relative(root, full));
    }
  }
  return files;
}

const files = collect(root).sort();
if (!files.length) {
  console.error("No launcher test files found.");
  process.exit(1);
}

console.log(`[test] Running ${files.length} launcher test files`);
const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
