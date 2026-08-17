import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { archiveArtifactToVps } from "@/lib/mirrors/cacheManager";

export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  try {
    const { artifactId } = await req.json();
    if (!artifactId) return NextResponse.json({ error: "artifactId is required" }, { status: 400 });
    const actor = session?.user?.name || session?.user?.email || "admin";
    const result = await archiveArtifactToVps(String(artifactId), actor);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Archive failed" }, { status: 500 });
  }
}
