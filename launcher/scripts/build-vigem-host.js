/**
 * Builds PlayBound.VigemHost.exe into resources/vigem/ for packaging.
 * Requires .NET 6+ SDK (win-x64 self-contained single-file).
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const TAG = "[build-vigem-host]";
const toolsDir = path.join(__dirname, "..", "tools", "vigem-host");
const outDir = path.join(__dirname, "..", "resources", "vigem");
const publishDir = path.join(toolsDir, "bin", "publish");
const exeName = "PlayBound.VigemHost.exe";

function resolveDotnet() {
  const fromPath = spawnSync("dotnet", ["--version"], { encoding: "utf8", shell: false });
  if (fromPath.status === 0) return "dotnet";
  const candidates = [
    path.join(process.env["ProgramFiles"] || "C:\\Program Files", "dotnet", "dotnet.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "dotnet", "dotnet.exe"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function main() {
  if (process.platform !== "win32") {
    console.log(`${TAG} Skipping (Windows only).`);
    return;
  }

  const dotnet = resolveDotnet();
  if (!dotnet) {
    throw new Error("dotnet SDK not found. Install .NET 6+ to build the ViGEm host.");
  }

  const ver = spawnSync(dotnet, ["--version"], { encoding: "utf8", shell: false });
  console.log(`${TAG} Using ${dotnet} (${(ver.stdout || "").trim()})`);

  fs.mkdirSync(outDir, { recursive: true });
  console.log(`${TAG} Publishing self-contained ${exeName}…`);
  const result = spawnSync(
    dotnet,
    [
      "publish",
      path.join(toolsDir, "PlayBound.VigemHost.csproj"),
      "-c",
      "Release",
      "-r",
      "win-x64",
      "--self-contained",
      "true",
      "-p:PublishSingleFile=true",
      "-p:IncludeNativeLibrariesForSelfExtract=true",
      "-o",
      publishDir,
    ],
    { cwd: toolsDir, stdio: "inherit", shell: false }
  );
  if (result.status !== 0) {
    throw new Error("dotnet publish failed");
  }

  const built = path.join(publishDir, exeName);
  if (!fs.existsSync(built)) {
    throw new Error(`Publish output missing: ${built}`);
  }
  const dest = path.join(outDir, exeName);
  fs.copyFileSync(built, dest);
  console.log(`${TAG} Wrote ${dest} (${fs.statSync(dest).size} bytes)`);
}

try {
  main();
} catch (err) {
  console.error(`${TAG} ERROR: ${err.message || err}`);
  process.exit(1);
}
