import {createOpenRaAppImageUpdater} from "./openRaAppImageUpdates.js";
// The catalog client is pinned to this playtest. A newer server requires a
// corresponding client compatibility review, not the repository's launcher tag.
export const CRYSTALLIZED_NEXUS_PIN={latest:"playtest-20260820"};
const updater=createOpenRaAppImageUpdater({
  label:"Crystallized Nexus",key:"crystallized-nexus",binary:"OpenRA.Server",marker:".pb-cn-release.json",
  repository:"DoGyAUT/crystallized-nexus",assetPrefix:"CrystallizedNexus",archiveRoot:"usr/lib/openra",mod:"cn",
  tag:/^playtest-20260820$/,engine:/^cn-20260820$/,allowPrereleaseTag:"playtest-20260820",
  modVersion:()=>"cn-20260726",maximumBytes:512*1024**2,
  legacy:{buildId:"playtest-20260820",size:390986232,digest:"sha256:c3db42ad7dd7c369763eb68db241d117a4bc46fe6a292e26db61d905175d2823"},
});
export const verifyCrystallizedNexusInstallation=updater.verifyInstallation;
export const stageCrystallizedNexusRelease=updater.stageRelease;
