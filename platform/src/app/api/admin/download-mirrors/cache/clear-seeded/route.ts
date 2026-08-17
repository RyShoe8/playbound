import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import { clearSeededArtifacts, findSeededArtifacts } from "@/lib/mirrors/seededArtifacts";

/**
 * GET  — what demo rows are still present, without changing anything.
 * POST — delete them.
 *
 * This exists as an admin action rather than only a script because the person
 * who needs to run it has no dev environment, and a one-time cleanup that can
 * only be performed from a terminal nobody has is a cleanup that never happens.
 */
export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();
    const report = await findSeededArtifacts();
    return NextResponse.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to inspect seeded rows";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();
    // Report first so the response can say what went, not just how many.
    const before = await findSeededArtifacts();
    if (before.artifacts.length === 0) {
      return NextResponse.json({
        success: true,
        artifactsDeleted: 0,
        sourcesDeleted: 0,
        message: "No demo rows found — nothing to clear.",
      });
    }

    const result = await clearSeededArtifacts();
    return NextResponse.json({
      success: true,
      ...result,
      cleared: before.artifacts.map((a) => a.artifactId),
      message: `Cleared ${result.artifactsDeleted} demo artifact(s) and ${result.sourcesDeleted} source(s). The table will refill from real downloads.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to clear seeded rows";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
