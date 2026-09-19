import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import DeveloperClaim from "@/lib/models/DeveloperClaim";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  await dbConnect();
  const claims = await DeveloperClaim.find()
    .sort({ createdAt: -1 })
    .populate("userId", "username email")
    .limit(100)
    .lean();

  return NextResponse.json({ claims });
}
