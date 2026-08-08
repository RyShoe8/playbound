import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { userFromLauncherBearer } from "@/lib/library";

/** Session user or launcher-linked account for presence write APIs. */
export async function getPresenceUserId(req?: Request): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) return session.user.id;
  } catch {
    /* ignore */
  }

  if (req) {
    try {
      const user = await userFromLauncherBearer(req);
      if (user?._id) return String(user._id);
    } catch {
      /* ignore */
    }
  }

  return null;
}
