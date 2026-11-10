import { playPreferencesSchema } from "@/lib/friends/playPreferences";
import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { availabilitySchema } from "@/lib/friends/availabilitySchema";
import { availabilityForFriends } from "@/lib/friends/availabilityService";
import PlayAvailability from "@/lib/models/PlayAvailability";
import dbConnect from "@/lib/db";
import { revalidateMultiplayerActivity } from "@/lib/multiplayer/activity";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: Request) {
  const id = await getFriendsUserId(req);
  if (!id) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers });
  return NextResponse.json(await availabilityForFriends(id), { headers });
}
export async function PUT(req: Request) {
  const id = await getFriendsUserId(req);
  if (!id) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers });
  const parsed = availabilitySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, headers });
  await dbConnect();
  await PlayAvailability.updateOne({ userId: id }, { $set: parsed.data }, { upsert: true, runValidators: true });
  revalidateMultiplayerActivity();
  return NextResponse.json({ success: true, availability: parsed.data }, { headers });
}

export async function PATCH(req: Request) {
  const id = await getFriendsUserId(req);
  if (!id) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers });
  const payload = await req.json().catch(() => null);
  if (payload && "window" in Object(payload)) {
    const result = availabilitySchema.safeParse({ timezone: payload.timezone, weekly: [], window: payload.window });
    if (!result.success) return NextResponse.json({ error: result.error.issues[0].message }, { status: 400, headers });
    await dbConnect();
    await PlayAvailability.updateOne({ userId: id }, {
      $set: { window: result.data.window, ...(result.data.window ? { publishLooking: true } : {}) }, $setOnInsert: { timezone: result.data.timezone },
    }, { upsert: true, runValidators: true });
    revalidateMultiplayerActivity();
    return NextResponse.json({ window: result.data.window }, { headers });
  }
  const result = playPreferencesSchema.safeParse(payload);
  if (!result.success) return NextResponse.json({ error: result.error.issues[0].message }, { status: 400, headers });
  await dbConnect();
  await PlayAvailability.updateOne({ userId: id }, { $set: { preferences: result.data }, $setOnInsert: { timezone: "UTC" } }, { upsert: true });
  return NextResponse.json({ preferences: result.data }, { headers });
}
