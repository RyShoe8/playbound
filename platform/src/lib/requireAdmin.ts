import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return { session: null, error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { session, error: null };
}
