import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { httpsGetStream } from "./downloadStream.js";
import { HX_RUNTIME_FILES } from "./hxRuntimeFiles.js";

export const HX_RELEASE = Object.freeze({
  latest: "0.9.89.4", url: "https://builds.hx.hanfling.de/testing/HX-0.9.89.4.zip",
  archiveBytes: 2495362, archiveSha256: "95fe3b1fcae3a834601b4fcdf5a6ca393aab1452f6165e82f345bd77769c3d5a",
});
const files = { ...HX_RUNTIME_FILES,
  "HCC.ini":"87af5197efc41787f997b0ca94fc5e82da7fc79c91c7046ff5dece9995b8b073",
  "HXDefault.ini":"6e2557d7f7adbb45d660af3c33ae37aaf2fe01c7d113a904b8e501f5822538ed",
  "HXDefUser.ini":"7fb091a5c0fa12b5279b57a186d0c96e5957d25e33e659c48d1cf3c2258871b2",
};
export function verifyHxInstallation(root) {
  const system=path.join(root,"System");
  if(fs.realpathSync(root)!==path.resolve(root)||fs.realpathSync(system)!==path.resolve(system)||!fs.lstatSync(system).isDirectory())throw new Error("HX installation directory requires review");
  for(const [name,expected] of Object.entries(files)) {
    const file=path.join(system,name),info=fs.lstatSync(file);
    if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>32*1024**2||fs.realpathSync(file)!==path.resolve(file))throw new Error("HX package file requires review");
    if(createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==expected)throw new Error("HX package differs from the reviewed release");
  }
  return {buildId:HX_RELEASE.latest};
}

export async function stageHxRelease(stage,{run,request=httpsGetStream,diskCheck=()=>{}}={}) {
  if(!/^\.pb-update-deus-ex-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(path.basename(stage))||fs.realpathSync(stage)!==path.resolve(stage))throw new Error("HX update requires isolated staging");
  verifyHxInstallation(stage);
  const archive=path.join(stage,".hx-release.zip");let response;
  try {
    response=await request(HX_RELEASE.url,{signal:AbortSignal.timeout(120000),followRedirects:false});
    if(response.statusCode!==200||!response.stream)throw new Error("HX publisher download unavailable");
    const fd=fs.openSync(archive,"wx",0o600),hash=createHash("sha256");let count=0;
    try {
      for await(const chunk of response.stream) {
        count+=chunk.length;if(count>HX_RELEASE.archiveBytes)throw new Error("HX archive exceeds reviewed size");
        diskCheck();hash.update(chunk);let offset=0;
        while(offset<chunk.length){const written=fs.writeSync(fd,chunk,offset,chunk.length-offset);if(!written)throw new Error("HX archive write failed");offset+=written;}
      }
      if(count!==HX_RELEASE.archiveBytes||hash.digest("hex")!==HX_RELEASE.archiveSha256)throw new Error("HX archive checksum mismatch");
      fs.fsyncSync(fd);
    }finally{fs.closeSync(fd);}
    await run("/usr/bin/python3",[fileURLToPath(new URL("./hxArchive.py",import.meta.url)),archive,path.join(stage,"System")],{timeout:30000,maxOutput:4096});
    return verifyHxInstallation(stage);
  }finally{response?.stream?.destroy();if(fs.existsSync(archive))fs.unlinkSync(archive);}
}
