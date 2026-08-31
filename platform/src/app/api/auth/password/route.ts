import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getServerSession } from "next-auth/next";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = passwordSchema.parse(body);

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from your current password" },
        { status: 400 }
      );
    }

    await dbConnect();

    const user = await User.findById(session.user.id).select("+password");
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Google-only accounts have no password to change. Say so plainly rather
    // than returning "User not found", which reads like a bug.
    if (!user.password) {
      return NextResponse.json(
        {
          error:
            "This account signs in with Google and has no password. Password sign-in isn't set up for it.",
        },
        { status: 400 }
      );
    }

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Password change error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
