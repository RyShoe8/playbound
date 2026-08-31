/**
 * Server read of the viewer's discovery mode.
 *
 * Cookie is the request-time source of truth so a toggle is visible on the
 * next navigation without waiting for an account PATCH. The signed-in
 * preference fills in when there is no cookie (a new device / cleared store).
 */

import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import {
  DEFAULT_DISCOVERY_MODE,
  DISCOVERY_MODE_COOKIE,
  parseDiscoveryMode,
  type DiscoveryMode,
} from "./discoveryMode";

export const getDiscoveryMode = cache(async (): Promise<DiscoveryMode> => {
  const jar = await cookies();
  const fromCookie = jar.get(DISCOVERY_MODE_COOKIE)?.value;
  if (fromCookie === "FREE" || fromCookie === "ALL") return fromCookie;

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return DEFAULT_DISCOVERY_MODE;

    await dbConnect();
    const user = await User.findById(userId)
      .select("preferences.discoveryMode")
      .lean<{ preferences?: { discoveryMode?: string } }>();
    return parseDiscoveryMode(user?.preferences?.discoveryMode);
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("[access] discovery mode read failed:", err);
    return DEFAULT_DISCOVERY_MODE;
  }
});
