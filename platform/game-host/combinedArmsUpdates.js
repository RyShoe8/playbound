import { createOpenRaAppImageUpdater } from "./openRaAppImageUpdates.js";

const updater = createOpenRaAppImageUpdater({
  label: "Combined Arms", key: "combined-arms", binary: "OpenRA.Server", marker: ".pb-combined-arms-release.json",
  repository: "Inq8/CAmod", assetPrefix: "CombinedArms", archiveRoot: "usr/lib/openra", mod: "ca",
  tag: /^\d+\.\d+(?:\.\d+)?$/, engine: /^ca-engine\/\d+\.\d+(?:\.\d+)?$/,
  // Official asset digest independently matched to the downloaded package.
  legacy: { buildId: "1.09", size: 223889912, digest: "sha256:09a56e835cdc22de896bd3731bf975442cbe31769cb04a54f9c444f28ed8049c" },
});
export const verifyCombinedArmsInstallation = updater.verifyInstallation;
export const stageCombinedArmsRelease = updater.stageRelease;
