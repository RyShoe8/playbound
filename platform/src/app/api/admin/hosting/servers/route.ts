import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminViewSession } from "@/lib/requireAdmin";
import CommunityServer from "@/lib/models/CommunityServer";
import User from "@/lib/models/User";
import { customerServerView } from "@/lib/dedicatedHosting/view";

/** GET — every customer (PlayBound Dedicated) server, with its owner. */
export async function GET() {
  const { error } = await requireAdminViewSession();
  if (error) return error;
  await dbConnect();
  const servers = await CommunityServer.find({ ownerType: "user" }).sort({ updatedAt: -1 }).limit(1000).lean();
  const owners = await User.find({ _id: { $in: servers.map((s) => s.ownerId).filter(Boolean) } })
    .select({ username: 1 })
    .lean();
  const ownerById = new Map(owners.map((u) => [String(u._id), u.username]));
  return NextResponse.json({
    servers: servers.map((s) => ({
      ...customerServerView(s as Record<string, unknown>),
      owner: ownerById.get(String(s.ownerId)) || null,
      slotsHeld: Boolean(s.slotsHeld),
      regionKey: s.regionKey,
    })),
  });
}
