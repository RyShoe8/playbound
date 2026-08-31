import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers, and underscores"),
});

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const body = await req.json();
    const { username } = profileSchema.parse(body);

    await dbConnect();

    const taken = await User.findOne({
      username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      _id: { $ne: session.user.id },
    });
    if (taken) {
      return NextResponse.json({ error: "That username is already taken" }, { status: 400 });
    }

    const user = await User.findByIdAndUpdate(
      session.user.id,
      { username },
      { returnDocument: "after" }
    );
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, username: user.username });
  } catch (error) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
