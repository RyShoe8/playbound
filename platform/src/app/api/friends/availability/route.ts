import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { availabilitySchema } from "@/lib/friends/availabilitySchema";
import { availabilityForFriends } from "@/lib/friends/availabilityService";
import PlayAvailability from "@/lib/models/PlayAvailability";
import dbConnect from "@/lib/db";
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
  return NextResponse.json({ success: true, availability: parsed.data }, { headers });
}
