import fs from "node:fs";
import { manageIsolatedDedicatedFiles } from "./dedicatedFiles.js";
try {
  const input = fs.readFileSync(0,"utf8");
  if (Buffer.byteLength(input) > 4 * 1024 ** 2 + 4096) throw Error("Request exceeds limit");
  const result = manageIsolatedDedicatedFiles(process.argv[2],process.argv[3],JSON.parse(input));
  process.stdout.write(JSON.stringify({ok:true,result}));
} catch (error) {
  process.stdout.write(JSON.stringify({ok:false,error:error?.code ? "The file operation could not complete." : String(error?.message || "File operation failed")}));
}
