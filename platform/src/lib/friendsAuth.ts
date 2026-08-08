import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { userFromLauncherBearer } from "@/lib/library";

/** Resolve the signed-in site user or launcher-linked account. */
export async function getFriendsUserId(req?: Request): Promise<string | null> {
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
