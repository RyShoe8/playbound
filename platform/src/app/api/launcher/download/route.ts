import { launcherDownloadResponseForRequest } from "@/lib/launcherDownloadResolve";

export async function GET(req: Request) {
  return launcherDownloadResponseForRequest(req);
}
