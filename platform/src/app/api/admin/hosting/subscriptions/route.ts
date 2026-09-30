import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { requireAdminSession, requireAdminViewSession } from "@/lib/requireAdmin";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import CommunityServer from "@/lib/models/CommunityServer";
import User from "@/lib/models/User";
import { getTier } from "@/lib/dedicatedHosting/tier";
import { regionalInventory, withRegionCapacityLease } from "@/lib/dedicatedHosting/capacity";
import { reconcileDedicatedCapacityReservations } from "@/lib/dedicatedHosting/reservations";

/** GET — every PlayBound Dedicated subscription with its customer and server counts. */
export async function GET() {
  const { error } = await requireAdminViewSession();
  if (error) return error;
  await dbConnect();
  const subs = await DedicatedSubscription.find({}).sort({ createdAt: -1 }).limit(500).lean();
  const users = await User.find({ _id: { $in: subs.map((s) => s.userId) } }).select({ username: 1, email: 1 }).lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const counts = await CommunityServer.aggregate<{ _id: unknown; saved: number; online: number }>([
    { $match: { ownerType: "user", dedicatedSubscriptionId: { $in: subs.map((s) => s._id) } } },
    {
      $group: {
        _id: "$dedicatedSubscriptionId",
        saved: { $sum: 1 },
        online: { $sum: { $cond: [{ $eq: ["$desiredState", "running"] }, 1, 0] } },
      },
    },
  ]);
  const countBySub = new Map(counts.map((c) => [String(c._id), c]));
  return NextResponse.json({
    subscriptions: subs.map((s) => {
      const u = userById.get(String(s.userId));
      const c = countBySub.get(String(s._id));
      return {
        id: String(s._id),
        userId: String(s.userId),
        username: u?.username || null,
        email: u?.email || null,
        tier: s.tier,
        regionKey: s.regionKey,
        slotCapacity: s.slotCapacity,
        allocatedSlots: s.allocatedSlots,
        status: s.status,
        source: s.source,
        note: s.note || null,
        savedServers: c?.saved || 0,
        onlineServers: c?.online || 0,
        createdAt: s.createdAt,
      };
    }),
  });
}

const grantSchema = z.object({
  user: z.string().trim().min(1).max(200), // username or email
  slotCapacity: z.number().int().min(1).max(512),
  regionKey: z.string().min(1).max(40),
  note: z.string().max(300).optional(),
});

/**
 * POST — grant a subscription by hand. This is the rollout path until checkout
 * exists; `source: "manual"` keeps these distinguishable from paid ones later.
 */
export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  const parsed = grantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid" }, { status: 400 });
  await dbConnect();
  const q = parsed.data.user;
  const user = await User.findOne(q.includes("@") ? { email: q.toLowerCase() } : { usernameNormalized: q.toLowerCase() })
    .select({ _id: 1 })
    .lean();
  if (!user) return NextResponse.json({ error: "No user with that username or email" }, { status: 404 });
  const tier = await getTier();
  if (!tier.regions.some((r) => r.key === parsed.data.regionKey)) {
    return NextResponse.json({ error: "Unknown region" }, { status: 400 });
  }
  if (parsed.data.slotCapacity > tier.maxSlotsSold || parsed.data.slotCapacity < tier.minAllocation ||
      parsed.data.slotCapacity % tier.allocationIncrement !== 0) {
    return NextResponse.json({ error: "Slot count is outside the Basic plan's supported sizes" }, { status: 400 });
  }
  try {
    return await withRegionCapacityLease(parsed.data.regionKey, async () => {
      const existing = await DedicatedSubscription.findOne({
        userId: user._id,
        tier: tier.key,
        status: { $in: ["active", "past_due", "suspended"] },
      }).lean();
      if (existing) {
        return NextResponse.json({ error: "That user already has a subscription; change its slots instead." }, { status: 409 });
      }
      const inventory = await regionalInventory(parsed.data.regionKey);
      if (inventory.availableSlots < parsed.data.slotCapacity) {
        return NextResponse.json({ error: inventory.reason || "Not enough regional capacity" }, { status: 409 });
      }
      const sub = await DedicatedSubscription.create({
        userId: user._id,
        tier: tier.key,
        regionKey: parsed.data.regionKey,
        slotCapacity: parsed.data.slotCapacity,
        status: "active",
        source: "manual",
        grantedBy: session!.user.id,
        note: parsed.data.note || null,
      });
      const reservationPending = await reconcileDedicatedCapacityReservations().then(() => false).catch(() => true);
      return NextResponse.json({ ok: true, id: String(sub._id), reservationPending }, { status: 201 });
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Capacity check failed" }, { status: 503 });
  }
}
