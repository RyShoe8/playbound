import { getServerSession } from "next-auth/next";
import { unstable_rethrow } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { userFromLauncherBearer } from "@/lib/library";

export function canAccessTesting(
  user: { role?: string; tester?: boolean } | null | undefined
): boolean {
  return user?.role === "admin" || Boolean(user?.tester);
}

/** True when the signed-in site session may see testing-catalog entries. */
export async function viewerCanSeeTesting(): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions);
    return canAccessTesting(session?.user);
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    return false;
  }
}

/** @deprecated Prefer viewerCanSeeTesting for catalog; admin CMS stays requireAdminSession. */
export async function viewerIsAdmin(): Promise<boolean> {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.role === "admin";
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    return false;
  }
}

/** True when the request is from an admin or tester (site session or launcher bearer). */
export async function requestIncludesTesting(req?: Request): Promise<boolean> {
  if (await viewerCanSeeTesting()) return true;

  if (req) {
    try {
      const user = await userFromLauncherBearer(req);
      if (user && canAccessTesting(user as { role?: string; tester?: boolean })) return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}
