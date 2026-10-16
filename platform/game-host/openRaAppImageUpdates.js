import fs from "node:fs";
import path from "node:path";
import { createVerifiedAppImageInstallation } from "./appImageInstallation.js";
import { appImageOffset } from "./openraUpdates.js";
import { readRelease, downloadAsset } from "./githubReleaseAssets.js";

// Profiles are fixed in trusted source modules, never supplied by HTTP callers.
export function createOpenRaAppImageUpdater(profile) {
  const { label, key, binary: BINARY, marker: MARKER } = profile;
  const verifyInstallation = createVerifiedAppImageInstallation(profile);

  // Preserve the existing AppImage launch format. No downloaded program is run
  // during preparation: unsquashfs reads only two bounded metadata files.
  async function stageRelease(stage, { run, request = fetch, diskCheck = () => {} }) {
    if (!new RegExp(`^\\.pb-update-${key}-[a-f0-9-]{36}$`).test(path.basename(stage))) throw new Error(`${label} updates require an isolated worker staging directory`);
    verifyInstallation(stage);
    const signal = AbortSignal.timeout(5 * 60_000);
    const release = await readRelease(profile.repository, { request, signal, label });
    if (release.draft !== false || (release.prerelease !== false && release.tag_name !== profile.allowPrereleaseTag) || !profile.tag.test(release.tag_name)) throw new Error(`${label} requires its declared official release channel`);
    const assetTag=profile.assetTag ? profile.assetTag(release.tag_name) : release.tag_name;
    const name = `${profile.assetPrefix}-${assetTag}-x86_64.AppImage`;
    const assets = release.assets?.filter((asset) => asset.name === name);
    if (assets?.length !== 1 || assets[0].browser_download_url !== `https://github.com/${profile.repository}/releases/download/${release.tag_name}/${name}`) throw new Error(`${label} release asset is missing or unofficial`);
    let asset = assets[0];
    if (release.tag_name === profile.legacy?.buildId) {
      if(asset.size !== profile.legacy.size) throw new Error(`${label} reviewed release size changed`);
      if (asset.digest && asset.digest !== profile.legacy.digest) throw new Error(`${label} reviewed release digest changed`);
      asset = { ...asset, digest: asset.digest || profile.legacy.digest };
    }
    const temporary = path.join(stage, `.pb-${key}-download`);
    await downloadAsset(asset, temporary, { request, signal, diskCheck, label, limit:profile.maximumBytes });
    const offset = String(appImageOffset(temporary));
    const read = (file, maxOutput) => run("/usr/bin/unsquashfs", ["-cat", "-o", offset, temporary, `${profile.archiveRoot}/${file}`], { root: stage, timeout: 30_000, maxOutput });
    const engine = (await read("VERSION", 128)).trim();
    const mod = await read(`mods/${profile.mod}/mod.yaml`, 256 * 1024);
    const embeddedVersion=profile.modVersion ? profile.modVersion(release.tag_name) : assetTag;
    if (!profile.engine.test(engine) || !new RegExp(`^\\s+Version: ${embeddedVersion}\\r?$`, "m").test(mod)) throw new Error(`${label} embedded game version differs from its release`);
    diskCheck();
    fs.chmodSync(temporary, 0o755);
    fs.renameSync(temporary, path.join(stage, BINARY));
    fs.writeFileSync(path.join(stage, MARKER), JSON.stringify({ version: 1, buildId: release.tag_name, digest: asset.digest, size: asset.size }), { mode: 0o600 });
    return verifyInstallation(stage);
  }

  return { verifyInstallation, stageRelease };
}
