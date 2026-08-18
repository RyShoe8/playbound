import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { userFromLauncherBearer } from "@/lib/library";
import User from "@/lib/models/User";
import {
  DISCOVERY_MODE_COOKIE,
  DISCOVERY_MODE_COOKIE_MAX_AGE,
} from "@/lib/access/discoveryMode";

const patchSchema = z
  .object({
    compatibilityFilter: z.enum(["compatible", "all"]).optional(),
    discoveryMode: z.enum(["FREE", "ALL"]).optional(),
  })
  .refine((d) => d.compatibilityFilter !== undefined || d.discoveryMode !== undefined, {
    message: "Nothing to update",
  });

async function resolveUserId(req: Request): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session.user.id;
  const launcherUser = await userFromLauncherBearer(req);
  return launcherUser?._id ? String(launcherUser._id) : null;
}

type PrefsLean = {
  preferences?: {
    compatibilityFilter?: string;
    discoveryMode?: string;
  };
};

function serializePrefs(prefs: PrefsLean["preferences"] | undefined) {
  const raw = prefs?.discoveryMode;
  return {
    compatibilityFilter: prefs?.compatibilityFilter ?? "compatible",
    discoveryMode: raw === "FREE" || raw === "ALL" ? raw : undefined,
  };
}

function withDiscoveryCookie(res: NextResponse, mode: string | undefined) {
  if (mode !== "FREE" && mode !== "ALL") return res;
  res.cookies.set(DISCOVERY_MODE_COOKIE, mode, {
    path: "/",
    maxAge: DISCOVERY_MODE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return res;
}

export async function GET(req: Request) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(userId).select("preferences").lean<PrefsLean>();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      preferences: serializePrefs(user.preferences),
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
    const parsed = patchSchema.parse(body);

    const $set: Record<string, string> = {};
    if (parsed.compatibilityFilter) {
      $set["preferences.compatibilityFilter"] = parsed.compatibilityFilter;
    }
    if (parsed.discoveryMode) {
      $set["preferences.discoveryMode"] = parsed.discoveryMode;
    }

    await dbConnect();
    const user = await User.findByIdAndUpdate(userId, { $set }, { returnDocument: "after" }).select(
      "preferences"
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const res = NextResponse.json({
      success: true,
      preferences: serializePrefs(user.preferences),
    });
    return withDiscoveryCookie(res, parsed.discoveryMode);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Preferences PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
