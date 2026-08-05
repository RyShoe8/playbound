import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { userFromLauncherBearer } from "@/lib/library";

export async function viewerIsAdmin(): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.role === "admin";
  } catch {
    return false;
  }
}

/** True when the request is from a PlayBound admin (site session or launcher bearer). */
export async function requestIncludesTesting(req?: Request): Promise<boolean> {
  if (await viewerIsAdmin()) return true;

  if (req) {
    try {
      const user = await userFromLauncherBearer(req);
      if (user && (user as { role?: string }).role === "admin") return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}
