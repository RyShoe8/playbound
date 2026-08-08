import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { getPresenceUserId } from "@/lib/presenceAuth";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

const schema = z.object({
  appearOffline: z.boolean(),
});

/** GET /api/presence/visibility — current appear-offline preference. */
export async function GET(req: Request) {
  const userId = await getPresenceUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  await dbConnect();
  const user = await User.findById(userId).select("preferences.appearOffline").lean();
  return NextResponse.json({
    appearOffline: Boolean(user?.preferences?.appearOffline),
  });
}

/** PATCH /api/presence/visibility — set appear offline for friends/public. */
export async function PATCH(req: Request) {
  const userId = await getPresenceUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = schema.parse(await req.json());
    await dbConnect();
    await User.findByIdAndUpdate(userId, {
      $set: { "preferences.appearOffline": body.appearOffline },
    });
    void saveEvent({
      event: "appear_offline_toggled",
      properties: { enabled: body.appearOffline },
      userId,
    });
    return NextResponse.json({ success: true, appearOffline: body.appearOffline });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("appear-offline update failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
