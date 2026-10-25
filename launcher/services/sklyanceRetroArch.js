/** Sky Lance's open EagleBIOS runs in Geolith's MVS/Europe mode. */
const fs = require("fs/promises");
const path = require("path");

function setOption(content, key, value) {
  const line = `${key} = "${value}"`;
  const pattern = new RegExp(`^${key}\\s*=.*$`, "m");
  return pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}${content ? "\n" : ""}${line}\n`;
}

async function prepareSklyanceRetroArch(runtimeRoot, gameDir) {
  const bios = path.join(gameDir, "neogeo.zip");
  try {
    await fs.access(bios);
  } catch {
    throw new Error("Sky Lance's open EagleBIOS (neogeo.zip) is missing. Reinstall Sky Lance through PlayBound.");
  }

  const configDir = path.join(runtimeRoot, "sklyance-config");
  const optionsPath = path.join(configDir, "Geolith", "Geolith.opt");
  await fs.mkdir(path.dirname(optionsPath), { recursive: true });
  const existing = await fs.readFile(optionsPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const options = setOption(setOption(existing, "geolith_system_type", "mvs"), "geolith_region", "eu");
  await fs.writeFile(optionsPath, options, "utf8");

  // Geolith looks for neogeo.zip in RetroArch's system directory. Point only
  // this launch at the bundled, redistributable EagleBIOS; do not alter the
  // managed runtime's default system directory or other games' BIOS settings.
  const configPath = path.join(runtimeRoot, "sklyance-retroarch.cfg");
  await fs.writeFile(configPath, [
    `system_directory = ${JSON.stringify(gameDir.replace(/\\/g, "/"))}`,
    `rgui_config_directory = ${JSON.stringify(configDir.replace(/\\/g, "/"))}`,
    "",
  ].join("\n"), "utf8");
  return ["--appendconfig", configPath];
}

module.exports = { prepareSklyanceRetroArch, setOption };
