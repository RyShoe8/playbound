import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import DedicatedSubscription from "@/lib/models/DedicatedSubscription";

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
  const filter: Record<string, unknown> = { _id: id };
  if (parsed.data.slotCapacity !== undefined) filter.allocatedSlots = { $lte: parsed.data.slotCapacity };
  const updated = await DedicatedSubscription.findOneAndUpdate(filter, { $set: parsed.data }, { new: true }).lean();
  if (!updated) {
    const exists = await DedicatedSubscription.exists({ _id: id });
    return exists
      ? NextResponse.json({ error: "More slots are in use than that. Stop servers first." }, { status: 409 })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
