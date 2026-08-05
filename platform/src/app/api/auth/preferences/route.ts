import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { userFromLauncherBearer } from "@/lib/library";
import User from "@/lib/models/User";

const patchSchema = z.object({
  compatibilityFilter: z.enum(["compatible", "all"]),
});

async function resolveUserId(req: Request): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session.user.id;
  const launcherUser = await userFromLauncherBearer(req);
  return launcherUser?._id ? String(launcherUser._id) : null;
}

export async function GET(req: Request) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(userId)
      .select("preferences")
      .lean<{ preferences?: { compatibilityFilter?: string } }>();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      preferences: {
        compatibilityFilter: user.preferences?.compatibilityFilter ?? "compatible",
      },
    });
  } catch (error) {
    console.error("Preferences GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const body = await req.json();
    const { compatibilityFilter } = patchSchema.parse(body);

    await dbConnect();
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { "preferences.compatibilityFilter": compatibilityFilter } },
      { new: true }
    ).select("preferences");

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      preferences: {
        compatibilityFilter: user.preferences?.compatibilityFilter ?? compatibilityFilter,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Preferences PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
