import { createOpenRaAppImageUpdater } from "./openRaAppImageUpdates.js";

const updater = createOpenRaAppImageUpdater({
  label: "OpenHV", key: "openhv", binary: "OpenHV.Server", marker: ".pb-openhv-release.json",
  repository: "OpenHV/OpenHV", assetPrefix: "OpenHV", archiveRoot: "usr/lib/openhv", mod: "hv",
  tag: /^\d{8}$/, engine: /^release-\d{8}$/,
  // Official GitHub digest independently matched to the existing VPS image.
  legacy: { buildId: "20250725", size: 144714232, digest: "sha256:01b1bf1cf86500f61d833e22055a035e56d07b3ddbc83b91446d684b35921aa3" },
});
export const verifyOpenHVInstallation = updater.verifyInstallation;
export const stageOpenHVRelease = updater.stageRelease;
