import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { PAIRED_RUNTIMES, verifyPairedInstallation } from "./pairedRuntimeUpdates.js";

const execute=promisify(execFile);
const WRAPPER='#!/usr/bin/env bash\nset -euo pipefail\nexec /usr/bin/xvfb-run -a /usr/bin/wine srcds.exe "$@"\n';
const digest=data=>createHash("sha256").update(data).digest("hex");
function directory(folder) {
  let ancestor=folder;
  while(!fs.existsSync(ancestor)) {
    try{fs.lstatSync(ancestor);throw new Error("GoldenEye directory link requires review");}catch(error){if(error.code!=="ENOENT")throw error;}
    ancestor=path.dirname(ancestor);
  }
  if(fs.realpathSync(ancestor)!==path.resolve(ancestor))throw new Error("GoldenEye directory ancestor requires review");
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  if(!fs.lstatSync(folder).isDirectory()||fs.realpathSync(folder)!==path.resolve(folder))throw new Error("GoldenEye private directory requires review");
}
function binding(destination,source) {
  try{if(!fs.lstatSync(destination).isSymbolicLink()||fs.readlinkSync(destination)!==source)throw new Error("GoldenEye runtime binding requires review");}
  catch(error){if(error.code!=="ENOENT")throw error;fs.symlinkSync(source,destination,fs.statSync(source).isDirectory()?"dir":"file");}
}
function privateFile(file,initial) {
  try{fs.writeFileSync(file,initial,{flag:"wx",mode:0o600});}catch(error){if(error.code!=="EEXIST")throw error;}
  const info=fs.lstatSync(file);
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>1024*1024)throw new Error("GoldenEye private file requires review");
}
export function prepareGoldenEye(shared,home,ctx,{verify=verifyPairedInstallation,launcherDigests=PAIRED_RUNTIMES["goldeneye-source"]?.versions.map(row=>row.launcherSha256)}={}) {
  const id=String(ctx?.communityServerId||ctx?.partyId||"");
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw new Error("GoldenEye requires a valid server identity");
  const verified=verify(shared,"goldeneye-source"),source=path.join(shared,"runtime");
  const privateHome=home,local=path.join(privateHome,"runtime"),mod=path.join(local,"gesource");
  directory(privateHome);
  if(fs.existsSync(path.join(local,"steamapps")))throw new Error("GoldenEye legacy private copy needs stopped-server migration; files were retained");
  directory(local);directory(mod);
  for(const name of fs.readdirSync(source)) {
    if(["gesource","defaults","srcds.exe","sdk-build.json"].includes(name))continue;
    binding(path.join(local,name),path.join(source,name));
  }
  const launcher=path.join(local,"srcds.exe"),bytes=fs.readFileSync(path.join(source,"srcds.exe"));
  privateFile(launcher,bytes);
  const previous=fs.readFileSync(launcher);
  if(!previous.equals(bytes)) {
    if(!launcherDigests?.includes(digest(previous)))throw new Error("GoldenEye private launcher requires review");
    const temporary=path.join(local,".launcher-"+randomUUID());
    try{fs.writeFileSync(temporary,bytes,{flag:"wx",mode:0o600});fs.renameSync(temporary,launcher);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  const wrapper=path.join(local,"run-server.sh");privateFile(wrapper,WRAPPER);
  if(fs.readFileSync(wrapper,"utf8")!==WRAPPER)throw new Error("GoldenEye private wrapper requires review");
  fs.chmodSync(wrapper,0o700);
  const mutable=new Set(["cfg","maps","python","logs","DownloadLists","download","downloads","custom","cache"]);
  const python=path.join(mod,"python"),sourcePython=path.join(source,"gesource/python");
  try {
    const info=fs.lstatSync(python);
    if(info.isSymbolicLink()) {
      if(fs.readlinkSync(python)!==sourcePython)throw new Error("GoldenEye Python binding requires review");
      fs.unlinkSync(python);
    }
  }catch(error){if(error.code!=="ENOENT")throw error;}
  for(const name of fs.readdirSync(path.join(source,"gesource"))) {
    if(mutable.has(name)||name==="modelsounds.cache"||/^console.*\.log$/.test(name))continue;
    binding(path.join(mod,name),path.join(source,"gesource",name));
  }
  for(const name of mutable)directory(path.join(mod,name));
  const bindPython=(original,destination)=>{
    for(const name of fs.readdirSync(original)) {
      if(["gphashes.txt","python.log","__pycache__"].includes(name))continue;
      const from=path.join(original,name),to=path.join(destination,name);
      if(fs.lstatSync(from).isDirectory()){directory(to);bindPython(from,to);}else binding(to,from);
    }
  };
  bindPython(sourcePython,python);
  const cfg=path.join(mod,"cfg"),defaults=path.join(source,"defaults/cfg");
  for(const name of fs.readdirSync(defaults)) {
    const original=path.join(defaults,name);
    if(!fs.lstatSync(original).isFile())throw new Error("GoldenEye default configuration requires review");
    privateFile(path.join(cfg,name),fs.readFileSync(original));
  }
  const maps=path.join(mod,"maps");directory(path.join(maps,"graphs"));
  for(const name of fs.readdirSync(path.join(source,"gesource/maps"))) {
    if(name!=="graphs")binding(path.join(maps,name),path.join(source,"gesource/maps",name));
  }
  const managed=path.join(cfg,"pb-managed.cfg");privateFile(managed,"");
  const quote=value=>'"'+String(value??"").replace(/[\r\n\x00-\x1f\x7f]/g,"").replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"';
  const temporary=path.join(cfg,".managed-"+randomUUID());
  try{fs.writeFileSync(temporary,"hostname "+quote(ctx.name||"PlayBound GoldenEye: Source")+"\nrcon_password "+quote(ctx.rconPassword)+"\n",{flag:"wx",mode:0o600});fs.renameSync(temporary,managed);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  return {...verified,privateHome,runtime:local};
}
export async function prepareGoldenEyeRuntime(shared,home,ctx) {
  const {stdout}=await execute(process.execPath,["--max-old-space-size=256",fileURLToPath(import.meta.url),"--verify",shared],{timeout:180000,maxBuffer:2048,env:{PATH:"/usr/bin:/bin",LANG:"C.UTF-8"}});
  const result=JSON.parse(stdout);
  if(typeof result.buildId!=="string")throw new Error("GoldenEye package verification did not finish");
  return prepareGoldenEye(shared,home,ctx,{verify:()=>result});
}
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv[2]==="--verify")console.log(JSON.stringify(verifyPairedInstallation(process.argv[3],"goldeneye-source")));
