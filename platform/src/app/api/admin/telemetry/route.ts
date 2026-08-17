import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import TelemetryEvent from "@/lib/models/TelemetryEvent";
import User from "@/lib/models/User";
import { eventsForFamily, type OpsFamily } from "@/lib/admin/opsEvents";

export const runtime = "nodejs";

const querySchema = z.object({
  event: z.string().min(1).max(128).optional(),
  family: z.enum(["all", "launcher", "party"]).optional(),
  gameSlug: z.string().min(1).max(120).optional(),
  partyId: z.string().min(1).max(64).optional(),
  userId: z.string().min(1).max(64).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    event: url.searchParams.get("event") || undefined,
    family: url.searchParams.get("family") || undefined,
    gameSlug: url.searchParams.get("gameSlug") || undefined,
    partyId: url.searchParams.get("partyId") || undefined,
    userId: url.searchParams.get("userId") || undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
    page: url.searchParams.get("page") || 1,
    limit: url.searchParams.get("limit") || 50,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { event, family, gameSlug, partyId, userId, from, to, page, limit } = parsed.data;
  const filter: Record<string, unknown> = {};
  if (event) filter.event = event;
  else {
    const names = eventsForFamily((family || "all") as OpsFamily);
    if (names) filter.event = { $in: names };
  }
  if (gameSlug) filter["properties.gameSlug"] = gameSlug;
  if (partyId) filter["properties.partyId"] = partyId;
  if (userId) filter.userId = userId;

  const createdAt: { $gte?: Date; $lte?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) createdAt.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) createdAt.$lte = d;
  }
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;

  await dbConnect();

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TelemetryEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TelemetryEvent.countDocuments(filter),
  ]);

  /*
   * Resolve the ids on this page to usernames in one lookup, so the console
   * can show who an event belongs to instead of the last eight characters of
   * an ObjectId. Ids that no longer resolve — deleted accounts, or an id from
   * another environment — simply stay absent and the console falls back.
   */
  const userIds = [...new Set(items.map((i) => i.userId).filter(Boolean))].map(String);
  const usernames: Record<string, string> = {};
  if (userIds.length) {
    const valid = userIds.filter((id) => mongoose.isValidObjectId(id));
    if (valid.length) {
      const users = await User.find({ _id: { $in: valid } })
        .select("username")
        .lean();
      for (const u of users) {
        if (u.username) usernames[String(u._id)] = String(u.username);
      }
    }
  }

  return NextResponse.json({
    items,
    usernames,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}
