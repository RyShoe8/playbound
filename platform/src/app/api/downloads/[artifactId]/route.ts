import { NextResponse } from "next/server";
import { resolveDownloadSources } from "@/lib/mirrors/resolution";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  try {
    const { artifactId } = await params;

    const result = await resolveDownloadSources(artifactId);
    if (!result) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    return NextResponse.json(result, {
      headers: {
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to resolve download sources";
    console.error("[Download Resolution API Error]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
