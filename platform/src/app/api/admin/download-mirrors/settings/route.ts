import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { getMirrorSettings, updateMirrorSettings } from "@/lib/mirrors/cacheManager";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const settings = await getMirrorSettings();
    return NextResponse.json({ settings });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load mirror settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  try {
    const body = await req.json();
    const actor = session?.user?.name || session?.user?.email || "admin";

    const allowedUpdates: Record<string, unknown> = {};
    if (typeof body.r2MonthlyBudgetGB === "number" && body.r2MonthlyBudgetGB > 0) {
      allowedUpdates.r2MonthlyBudgetGB = body.r2MonthlyBudgetGB;
    }
    if (typeof body.r2WarningThreshold === "number") {
      allowedUpdates.r2WarningThreshold = Math.max(1, Math.min(100, body.r2WarningThreshold));
    }
    if (typeof body.r2MinFreeBudgetGB === "number") {
      allowedUpdates.r2MinFreeBudgetGB = Math.max(0, body.r2MinFreeBudgetGB);
    }
    if (typeof body.r2MinRetentionHours === "number") {
      allowedUpdates.r2MinRetentionHours = Math.max(0, body.r2MinRetentionHours);
    }
    if (typeof body.autoPromotion === "boolean") {
      allowedUpdates.autoPromotion = body.autoPromotion;
    }
    if (typeof body.autoEviction === "boolean") {
      allowedUpdates.autoEviction = body.autoEviction;
    }
    if (typeof body.maxR2ArtifactSizeGB === "number") {
      allowedUpdates.maxR2ArtifactSizeGB = body.maxR2ArtifactSizeGB;
    }

    const updated = await updateMirrorSettings(allowedUpdates, actor);
    return NextResponse.json({ success: true, settings: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update mirror settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
