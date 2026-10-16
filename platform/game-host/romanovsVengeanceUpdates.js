import { createOpenRaAppImageUpdater } from "./openRaAppImageUpdates.js";

// The catalog calls this edition ra2; the published package actually uses rv.
const updater=createOpenRaAppImageUpdater({
  label:"Romanov's Vengeance",key:"romanovs-vengeance",binary:"OpenRA.Server",marker:".pb-rv-release.json",
  repository:"MustaphaTR/Romanovs-Vengeance",assetPrefix:"Romanovs.Vengeance",archiveRoot:"usr/lib/openra",mod:"rv",
  tag:/^playtest-\d{8}$/,engine:/^[a-f0-9]{40}$/,
  // Older GitHub assets lack digest metadata. Exact release/size/hash reviewed
  // against the publisher's Linux package; never use this for an unknown tag.
  legacy:{buildId:"playtest-20241215",size:141231296,digest:"sha256:f6f527fd3978ce15e89790ae2b3a165dc5d329e35a84fd90db29b8c4cedd4eed"},
});
export const verifyRomanovsVengeanceInstallation=updater.verifyInstallation;
export const stageRomanovsVengeanceRelease=updater.stageRelease;
