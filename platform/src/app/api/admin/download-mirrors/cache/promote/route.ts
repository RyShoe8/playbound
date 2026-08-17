import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { manualPromoteArtifact } from "@/lib/mirrors/cacheManager";

export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  try {
    const { artifactId } = await req.json();
    if (!artifactId) {
      return NextResponse.json({ error: "artifactId is required" }, { status: 400 });
    }

    const actor = session?.user?.name || session?.user?.email || "admin";
    const result = await manualPromoteArtifact(artifactId, actor);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Promotion failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
