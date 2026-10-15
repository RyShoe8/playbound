import { createOpenRaAppImageUpdater } from "./openRaAppImageUpdates.js";

const updater = createOpenRaAppImageUpdater({
  label: "OpenE2140", key: "earth-2140-trilogy", binary: "OpenE2140", marker: ".pb-opene2140-release.json",
  repository: "OpenE2140/OpenE2140", assetPrefix: "OpenE2140", archiveRoot: "usr/lib/openra", mod: "e2140",
  tag: /^release-\d{8}$/, engine: /^opene2140-engine-\d{8}$/,
  // Official GitHub digest independently matched to the existing VPS image.
  legacy: { buildId: "release-20260920", size: 70941176, digest: "sha256:7de51ffae6370f14ddf52e1e97a61770e62a1e16fa0cf2dd13165e8c253fc1d8" },
});
export const verifyOpenE2140Installation = updater.verifyInstallation;
export const stageOpenE2140Release = updater.stageRelease;
