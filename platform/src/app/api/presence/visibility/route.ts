import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { getPresenceUserId } from "@/lib/presenceAuth";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

const schema = z.object({
  appearOffline: z.boolean().optional(),
  hideActivityFromFriends: z.boolean().optional(),
  allowPlayInvites: z.boolean().optional(),
  notifyFriendActivity: z.boolean().optional(),
});

/** GET /api/presence/visibility — current social privacy preferences. */
export async function GET(req: Request) {
  const userId = await getPresenceUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  await dbConnect();
  const user = await User.findById(userId).select("preferences").lean();
  const prefs = (user as { preferences?: Record<string, unknown> } | null)?.preferences || {};
  return NextResponse.json({
    appearOffline: Boolean(prefs.appearOffline),
    hideActivityFromFriends: Boolean(prefs.hideActivityFromFriends),
    allowPlayInvites: prefs.allowPlayInvites !== false,
    notifyFriendActivity: prefs.notifyFriendActivity !== false,
  });
}

/** PATCH /api/presence/visibility — update appear-offline / activity privacy. */
export async function PATCH(req: Request) {
  const userId = await getPresenceUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = schema.parse(await req.json());
    if (
      body.appearOffline === undefined &&
      body.hideActivityFromFriends === undefined &&
      body.allowPlayInvites === undefined &&
      body.notifyFriendActivity === undefined
    ) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    await dbConnect();
    const $set: Record<string, boolean> = {};
    if (body.appearOffline !== undefined) $set["preferences.appearOffline"] = body.appearOffline;
    if (body.hideActivityFromFriends !== undefined) {
      $set["preferences.hideActivityFromFriends"] = body.hideActivityFromFriends;
    }
    if (body.allowPlayInvites !== undefined) {
      $set["preferences.allowPlayInvites"] = body.allowPlayInvites;
    }
    if (body.notifyFriendActivity !== undefined) {
      $set["preferences.notifyFriendActivity"] = body.notifyFriendActivity;
    }

    await User.findByIdAndUpdate(userId, { $set });
    if (body.appearOffline !== undefined) {
      void saveEvent({
        event: "appear_offline_toggled",
        properties: { enabled: body.appearOffline },
        userId,
      });
    }
    const user = await User.findById(userId).select("preferences").lean();
    const prefs = (user as { preferences?: Record<string, unknown> } | null)?.preferences || {};
    return NextResponse.json({
      success: true,
      appearOffline: Boolean(prefs.appearOffline),
      hideActivityFromFriends: Boolean(prefs.hideActivityFromFriends),
      allowPlayInvites: prefs.allowPlayInvites !== false,
      notifyFriendActivity: prefs.notifyFriendActivity !== false,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("appear-offline update failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
