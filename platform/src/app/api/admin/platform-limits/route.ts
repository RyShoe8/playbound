import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import PlatformLimits from "@/lib/models/PlatformLimits";
import { getPoolStatus } from "@/lib/entitlements/pool";
import { requireAdminSession } from "@/lib/requireAdmin";
import { PARTY_STRUCTURAL_MAX } from "@/lib/playTogether/types";
import { firstZodErrorMessage } from "@/lib/zodError";

/**
 * The free party pool, and the rails around it.
 *
 * Read returns the settings alongside live usage, because the number that
 * decides whether the pool is the right size is how much of it is spoken for —
 * setting it blind is guesswork.
 *
 * Every field is optional so one can be changed without restating the rest: a
 * whole-document write is how a stale form silently reverts someone else's
 * edit, which is the same reason the game routes are split by concern.
 */

const limitsSchema = z
  .object({
    freePartySlotPool: z.number().int().min(0).max(100_000).optional(),
    /*
     * Two is the floor because a party of one is not a party, and the join
     * rules already refuse below it. Bounded by the structural guard rather
     * than by maxPartySize, so the two can be saved in either order without
     * one rejecting the other mid-edit; the arithmetic takes the smaller.
     */
    freePartyHardCap: z.number().int().min(2).max(PARTY_STRUCTURAL_MAX).optional(),
    /*
     * The real party ceiling, subscribers included. Bounded only by the
     * runaway guard on the document — everything below that is a business
     * decision, which is why it lives here rather than in code.
     */
    maxPartySize: z.number().int().min(2).max(PARTY_STRUCTURAL_MAX).optional(),
    defaultPartySize: z.number().int().min(2).max(PARTY_STRUCTURAL_MAX).optional(),
    freePartyBaseline: z.number().int().min(0).max(200).optional(),
    poolEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();
    const [limits, usage] = await Promise.all([
      PlatformLimits.findOneAndUpdate(
        { singletonKey: "default" },
        { $setOnInsert: { singletonKey: "default" } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean(),
      getPoolStatus(),
    ]);
    return NextResponse.json({ limits, usage });
  } catch (err) {
    console.error("Platform limits read error:", err);
    return NextResponse.json({ error: "Failed to load platform limits" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const patch = limitsSchema.parse(await req.json());

    await dbConnect();
    const limits = await PlatformLimits.findOneAndUpdate(
      { singletonKey: "default" },
      { $set: patch, $setOnInsert: { singletonKey: "default" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    /*
     * Report usage against the new figure so the caller sees immediately
     * whether they have set the pool below what is already claimed. That is
     * allowed — nobody is evicted, slots are held until their member leaves —
     * but it does mean no new joins until usage falls back under the line, and
     * an admin should not have to work that out from two separate screens.
     */
    const usage = await getPoolStatus();
    return NextResponse.json({ success: true, limits, usage });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 400 });
    }
    console.error("Platform limits update error:", err);
    return NextResponse.json({ error: "Failed to update platform limits" }, { status: 500 });
  }
}
