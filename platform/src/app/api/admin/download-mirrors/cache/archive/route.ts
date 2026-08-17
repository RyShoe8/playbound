import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { archiveArtifactToVps } from "@/lib/mirrors/cacheManager";

export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  try {
    const { artifactId, sourceUrl, artifact } = await req.json();
    if (!artifactId) return NextResponse.json({ error: "artifactId is required" }, { status: 400 });
    const actor = session?.user?.name || session?.user?.email || "admin";
    const result = await archiveArtifactToVps(
      String(artifactId),
      actor,
      typeof sourceUrl === "string" ? sourceUrl : null,
      artifact && typeof artifact === "object"
        ? {
            gameSlug: typeof artifact.gameSlug === "string" ? artifact.gameSlug : null,
            version: typeof artifact.version === "string" ? artifact.version : null,
            filename: typeof artifact.filename === "string" ? artifact.filename : null,
            sizeBytes: typeof artifact.sizeBytes === "number" ? artifact.sizeBytes : null,
            artifactType: typeof artifact.artifactType === "string" ? artifact.artifactType : null,
          }
        : null
    );
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Archive failed" }, { status: 500 });
  }
}
