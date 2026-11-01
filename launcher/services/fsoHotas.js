"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");

function findFsoExecutable(installDir) {
  const binRoot = path.join(installDir, "kn_portable", "Library", "bin");
  if (!fs.existsSync(binRoot)) return null;
  const visit = (dir, depth) => {
    if (depth > 5) return null;
    let names;
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    const binary = names.find((entry) => entry.isFile() && /^fs2_open_.*\.exe$/i.test(entry.name) && !/FASTDBG/i.test(entry.name));
    if (binary) return path.join(dir, binary.name);
    for (const entry of names) {
      if (!entry.isDirectory()) continue;
      const found = visit(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
    return null;
  };
  return visit(binRoot, 0);
}

function parseFsoJoysticks(stdout) {
  const raw = String(stdout || "");
  const start = raw.indexOf("{");
  if (start < 0) return [];
  let flags;
  try { flags = JSON.parse(raw.slice(start)); } catch { return []; }
  const items = Array.isArray(flags.joysticks) ? flags.joysticks : [];
  return items.filter((device) =>
    Number.isInteger(device.id) && device.id >= 0 &&
    /^[0-9a-f]{32}$/i.test(String(device.guid || ""))
  ).map((device) => ({
    id: device.id,
    guid: String(device.guid).toUpperCase(),
    name: String(device.name || `Input device ${device.id}`).slice(0, 100),
  }));
}

function queryFsoJoysticks(exe) {
  return new Promise((resolve, reject) => {
    execFile(exe, ["-get_flags", "json_v1"], {
      cwd: path.dirname(exe),
      env: { ...process.env, FSO_KEEP_STDOUT: "1" },
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }, (error, stdout) => {
      // FSO 26.0.1 exits 1 after successfully printing JSON flags. Treat the
      // payload as the result; reject only when the process produced no JSON.
      if (String(stdout || "").includes('"joysticks"')) return resolve(parseFsoJoysticks(stdout));
      if (error) return reject(error);
      resolve([]);
    });
  });
}

function withFsoJoysticks(original, devices) {
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = String(original || "").split(/\r?\n/);
  let start = lines.findIndex((line) => /^\[Default\]\s*$/i.test(line));
  if (start < 0) {
    lines.push("[Default]");
    start = lines.length - 1;
  }
  let end = lines.findIndex((line, index) => index > start && /^\[.+\]\s*$/.test(line));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end).filter((line) => !/^Joy[0-3](?:ID|GUID)\s*=/i.test(line));
  const assignments = devices.slice(0, 4).flatMap((device, index) => [
    `Joy${index}ID=${device.id}`,
    `Joy${index}GUID=${device.guid}`,
  ]);
  lines.splice(start + 1, end - start - 1, ...section, ...assignments);
  return lines.join(newline);
}

function fsoSettingsPath(installDir, appData) {
  const portable = path.join(installDir, "kn_portable", "HardLightProductions", "FreeSpaceOpen", "fs2_open.ini");
  if (fs.existsSync(portable)) return portable;
  return path.join(appData, "HardLightProductions", "FreeSpaceOpen", "fs2_open.ini");
}

async function saveFsoJoysticks(settingsPath, devices) {
  const original = await fsp.readFile(settingsPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const next = withFsoJoysticks(original, devices);
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  const temp = `${settingsPath}.playbound-${process.pid}.tmp`;
  await fsp.writeFile(temp, next, "utf8");
  try { await fsp.rename(temp, settingsPath); }
  catch (error) { await fsp.rm(temp, { force: true }); throw error; }
}

module.exports = { findFsoExecutable, parseFsoJoysticks, queryFsoJoysticks, withFsoJoysticks, fsoSettingsPath, saveFsoJoysticks };
