import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PAIRED_RUNTIMES, verifyPairedInstallation } from "./pairedRuntimeUpdates.js";

export const GOLDENEYE_RELEASE=Object.freeze({appId:310,sdkBuild:"195543",modVersion:"5.0.6",archiveBytes:2186852760,archiveSha256:"79643189e9d6549e13ed9545d2277cb34bac05fff645d44d9de1f0ab030610d3"});
export function goldenEyeArchivePath(gamesRoot){return path.join(gamesRoot,".pb-artifact-cache","goldeneye-"+GOLDENEYE_RELEASE.archiveSha256+".7z");}
export function verifyGoldenEyeArchive(gamesRoot) {
  const file=goldenEyeArchivePath(gamesRoot),release=GOLDENEYE_RELEASE;
  if(fs.realpathSync(gamesRoot)!==path.resolve(gamesRoot)||fs.realpathSync(file)!==file)throw new Error("GoldenEye archive cache path requires review");
  const info=fs.lstatSync(file);
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size!==release.archiveBytes)throw new Error("GoldenEye official archive cache is unavailable or changed");
  const hash=createHash("sha256"),buffer=Buffer.alloc(512*1024),fd=fs.openSync(file,"r");
  try{let size;while((size=fs.readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,size));}finally{fs.closeSync(fd);}
  if(hash.digest("hex")!==release.archiveSha256)throw new Error("GoldenEye archive checksum differs from its publisher");
  return file;
}
export async function stageGoldenEye(stage,{run,diskCheck=()=>{},verify=verifyPairedInstallation,resolveArchive=verifyGoldenEyeArchive}={}) {
  if(!/^\.pb-update-goldeneye-source-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(path.basename(stage))||fs.realpathSync(stage)!==path.resolve(stage))throw new Error("GoldenEye requires isolated package staging");
  const archive=resolveArchive(path.dirname(stage));diskCheck(12*1024**3);
  const sdk=path.join(stage,"source-sdk"),home=path.join(stage,"steam-home");
  for(const name of ["source-sdk","steam-home","runtime"]) {
    try{fs.lstatSync(path.join(stage,name));throw new Error("GoldenEye staging already contains package files");}catch(error){if(error.code!=="ENOENT")throw error;}
  }
  fs.mkdirSync(sdk,{mode:0o700});fs.mkdirSync(home,{mode:0o700});
  const args=["-i","PATH=/usr/local/bin:/usr/bin:/bin:/usr/games","LANG=C.UTF-8",`HOME=${home}`,`XDG_DATA_HOME=${path.join(home,".local/share")}`,"/usr/games/steamcmd","+@sSteamCmdForcePlatformType","windows","+force_install_dir",sdk,"+login","anonymous","+app_update","310","validate","+quit"];
  for(let attempt=0;;attempt++) {
    try{await run("/usr/bin/env",args,{root:path.dirname(stage),timeout:15*60_000,maxOutput:32768});break;}
    catch(error){if(attempt||!/^SteamCMD (?:download failed|could not connect)/.test(error.message))throw error;await new Promise(resolve=>setTimeout(resolve,2000));}
  }
  await run("/usr/bin/python3",[fileURLToPath(new URL("./goldenEyePackage.py",import.meta.url)),sdk,archive,path.join(stage,"runtime")],{root:path.dirname(stage),timeout:15*60_000,maxOutput:4096});
  const result=verify(stage,"goldeneye-source");
  if(result.buildId!==PAIRED_RUNTIMES["goldeneye-source"].latest)throw new Error("GoldenEye SDK/mod pair differs from review");
  fs.rmSync(sdk,{recursive:true});fs.rmSync(home,{recursive:true});return result;
}
