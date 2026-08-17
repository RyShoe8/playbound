import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { toggleProtectArtifact } from "@/lib/mirrors/cacheManager";

export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  try {
    const { artifactId, protect } = await req.json();
    if (!artifactId) {
      return NextResponse.json({ error: "artifactId is required" }, { status: 400 });
    }

    const actor = session?.user?.name || session?.user?.email || "admin";
    const result = await toggleProtectArtifact(artifactId, Boolean(protect), actor);

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Protect toggle failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
