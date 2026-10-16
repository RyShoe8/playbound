import {createOpenRaAppImageUpdater} from "./openRaAppImageUpdates.js";
const updater=createOpenRaAppImageUpdater({
  label:"Tiberian Dawn HD",key:"tiberian-dawn-hd",binary:"OpenRA.Server",marker:".pb-tdhd-release.json",
  repository:"OpenRA/TiberianDawnHD",assetPrefix:"TiberianDawnHD",archiveRoot:"usr/lib/openra",mod:"cnc",
  tag:/^release-\d{8}(?:-v\d+)?$/,engine:/^[a-f0-9]{10,40}$/,assetTag:tag=>tag.replace(/-v\d+$/,""),
  legacy:{buildId:"release-20250330-v4",size:58518008,digest:"sha256:0703958c92dcd91ceb952a13d4e03f6eca77aa7cdb9ce1a86e69288bf73e1936"},
});
export const verifyTiberianDawnHdInstallation=updater.verifyInstallation;
export const stageTiberianDawnHdRelease=updater.stageRelease;
