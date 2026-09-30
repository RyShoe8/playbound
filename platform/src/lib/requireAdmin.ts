import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { canViewAdmin, canWriteAdmin } from "@/lib/adminAccess";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

/** Mutating admin operations require full Admin. */
export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (!canWriteAdmin(session?.user?.role)) {
    return { session: null, error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  // JWT roles are refreshed periodically. Recheck writes so a demoted admin
  // cannot keep changing data during that refresh window.
  await dbConnect();
  const user = await User.findById(session?.user?.id).select("role disabled").lean();
  if (!user || user.disabled || !canWriteAdmin(user.role)) {
    return { session: null, error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { session, error: null };
}

/** Read-only admin endpoints may also serve Admin Viewer. */
export async function requireAdminViewSession() {
  const session = await getServerSession(authOptions);
  if (!canViewAdmin(session?.user?.role)) {
    return { session: null, error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  return { session, error: null };
}
