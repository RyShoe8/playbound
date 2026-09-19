import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import Developer from "@/lib/models/Developer";

export type SessionUser = {
  id: string;
  username: string;
  role: "user" | "developer" | "admin";
  tester?: boolean;
};

/**
 * Ensures the session is logged in as a developer or an admin.
 * If not authenticated, returns a 401 response.
 */
export async function requireDeveloperOrAdminSession() {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!user?.id) {
    return {
      session: null,
      user: null,
      error: NextResponse.json({ error: "Unauthorized: Sign in required" }, { status: 401 }),
    };
  }

  return { session, user, error: null };
}

/**
 * Checks if a session user has permission to edit a specific game.
 * Admins can edit any game.
 * Developers can edit games where:
 * 1) game.ownerUserId matches user.id, OR
 * 2) developer.ownerUserId matches user.id (for the game's developerSlug)
 */
export async function canEditGame(
  user: { id?: string; role?: string } | null | undefined,
  game: { ownerUserId?: unknown; developerSlug?: string | null }
): Promise<boolean> {
  if (!user?.id) return false;
  if (user.role === "admin") return true;

  // Direct game owner
  if (game.ownerUserId && String(game.ownerUserId) === user.id) {
    return true;
  }

  // Studio owner (owns developer entity corresponding to developerSlug)
  if (game.developerSlug) {
    await dbConnect();
    const dev = await Developer.findOne({
      slug: game.developerSlug,
      ownerUserId: user.id,
    }).select("_id").lean();

    if (dev) return true;
  }

  return false;
}

/**
 * Checks if a session user has permission to edit a specific developer studio profile.
 * Admins can edit any developer profile.
 * Developers can edit if developer.ownerUserId matches user.id.
 */
export function canEditDeveloper(
  user: { id?: string; role?: string } | null | undefined,
  developer: { ownerUserId?: unknown }
): boolean {
  if (!user?.id) return false;
  if (user.role === "admin") return true;

  if (developer.ownerUserId && String(developer.ownerUserId) === user.id) {
    return true;
  }

  return false;
}

/**
 * Returns all games that a user can manage (either directly owned or owned via studio profile).
 */
export async function listManageableGames(userId: string) {
  await dbConnect();

  // Find all studio slugs owned by this user
  const ownedDevs = await Developer.find({ ownerUserId: userId }).select("slug").lean();
  const ownedSlugs = ownedDevs.map((d) => String(d.slug));

  const query: Record<string, unknown> = {
    $or: [
      { ownerUserId: userId },
      ...(ownedSlugs.length > 0 ? [{ developerSlug: { $in: ownedSlugs } }] : []),
    ],
  };

  return CatalogGame.find(query)
    .sort({ title: 1 })
    .select("slug title tagline coverImage developerSlug developerName published status adminUpdatedAt updatedAt")
    .lean();
}

/**
 * Returns all developer studio profiles owned by this user.
 */
export async function listManageableDevelopers(userId: string) {
  await dbConnect();
  return Developer.find({ ownerUserId: userId }).sort({ name: 1 }).lean();
}
