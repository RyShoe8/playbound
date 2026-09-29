import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";
import { regionalInventory, withRegionCapacityLease } from "@/lib/dedicatedHosting/capacity";
import { getTier } from "@/lib/dedicatedHosting/tier";
import { reconcileDedicatedCapacityReservations } from "@/lib/dedicatedHosting/reservations";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["active", "past_due", "suspended", "canceled", "expired"]).optional(),
  slotCapacity: z.number().int().min(1).max(512).optional(),
  note: z.string().max(300).nullable().optional(),
});

/**
 * PATCH — suspend/resume/cancel, resize, or annotate. Suspending or cancelling
 * stops the customer's servers on the next reconcile; their saved servers and
 * data stay. Shrinking below the slots currently in use is refused: stop
 * servers first, as a downgrade will require.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid" }, { status: 400 });
  await dbConnect();
  const initial = await DedicatedSubscription.findById(id).select({ regionKey: 1 }).lean();
  if (!initial) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return await withRegionCapacityLease(initial.regionKey, async () => {
      const current = await DedicatedSubscription.findById(id).lean();
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (current.source === "stripe" && (parsed.data.status !== undefined || parsed.data.slotCapacity !== undefined)) {
        return NextResponse.json({ error: "Paid subscription status and size must be changed through the billing workflow" }, { status: 409 });
      }
      const nextSlots = parsed.data.slotCapacity ?? current.slotCapacity;
      const nextStatus = parsed.data.status ?? current.status;
      if (parsed.data.slotCapacity !== undefined) {
        const tier = await getTier();
        if (nextSlots > tier.maxSlotsSold || nextSlots < tier.minAllocation || nextSlots % tier.allocationIncrement !== 0) {
          return NextResponse.json({ error: "Slot count is outside the Basic plan's supported sizes" }, { status: 400 });
        }
        if (nextSlots < current.allocatedSlots) {
          return NextResponse.json({ error: "More slots are in use than that. Stop servers first." }, { status: 409 });
        }
      }
      const reserves = (status: string) => ["active", "past_due"].includes(status);
      const added = (reserves(nextStatus) ? nextSlots : 0) - (reserves(current.status) ? current.slotCapacity : 0);
      if (added > 0) {
        const inventory = await regionalInventory(current.regionKey);
        if (inventory.availableSlots < added) {
          return NextResponse.json({ error: inventory.reason || "Not enough regional capacity" }, { status: 409 });
        }
      }
      await DedicatedSubscription.updateOne({ _id: id }, { $set: parsed.data });
      const reservationPending = await reconcileDedicatedCapacityReservations().then(() => false).catch(() => true);
      return NextResponse.json({ ok: true, reservationPending });
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Capacity check failed" }, { status: 503 });
  }
}
