import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { requireAdminSession } from "@/lib/requireAdmin";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  await dbConnect();
  const users = await User.find()
    .select("username email role emailVerified disabled createdAt")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    users: users.map((u) => ({
      id: String(u._id),
      username: u.username,
      email: u.email,
      role: u.role,
      emailVerified: Boolean(u.emailVerified),
      disabled: Boolean(u.disabled),
      createdAt: u.createdAt,
    })),
  });
}
