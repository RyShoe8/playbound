import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import { resetResourceCalibration, sampleRunningResourceUsage } from "@/lib/communityHosting/calibration";

export const maxDuration = 60;
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset"), requestId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("sample") }).strict(),
]);
export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  const input = inputSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid calibration action" }, { status: 400 });
  try {
    const result = input.data.action === "reset"
      ? await resetResourceCalibration(session!.user.id, input.data.requestId)
      : await sampleRunningResourceUsage();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[hosting-calibration] failed", error);
    return NextResponse.json({ error: "Calibration failed; measurements were not cleared unless the reset transaction completed." }, { status: 503 });
  }
}
