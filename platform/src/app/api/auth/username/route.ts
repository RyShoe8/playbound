import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

/** Same rules as the profile editor, so a username means one thing everywhere. */
const usernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers, and underscores"),
});

/** Reserved for placeholders and routes — see oauthUser.placeholderUsername. */
const RESERVED = /^(pb_[0-9a-f]{12}|admin|playbound|support|api|null|undefined)$/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Claim a username after an OAuth signup.
 *
 * Separate from /api/auth/profile because this one also clears the
 * `needsUsername` gate, and it is the only route reachable while that gate is
 * up (middleware blocks everything else).
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const { username } = usernameSchema.parse(await req.json());

    if (RESERVED.test(username)) {
      return NextResponse.json({ error: "That username isn't available" }, { status: 400 });
    }

    await dbConnect();

    const taken = await User.findOne({
      username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") },
      _id: { $ne: session.user.id },
    });
    if (taken) {
      return NextResponse.json({ error: "That username is already taken" }, { status: 400 });
    }

    const user = await User.findByIdAndUpdate(
      session.user.id,
      { username, needsUsername: false },
      { returnDocument: "after" }
    );
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, username: user.username });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Username claim error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Availability check for the picker's live feedback. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("username") ?? "";
  const parsed = usernameSchema.safeParse({ username: raw });
  if (!parsed.success) {
    return NextResponse.json({ available: false, error: parsed.error.issues[0].message });
  }
  const username = parsed.data.username;

  if (RESERVED.test(username)) {
    return NextResponse.json({ available: false, error: "That username isn't available" });
  }

  try {
    await dbConnect();
    const taken = await User.findOne({
      username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") },
    });
    return NextResponse.json({
      available: !taken,
      ...(taken ? { error: "That username is already taken" } : {}),
    });
  } catch {
    // Never block the form on a lookup failure — POST re-checks authoritatively.
    return NextResponse.json({ available: true });
  }
}
