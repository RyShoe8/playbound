import { NextResponse } from "next/server";
import { resolveDownloadSources } from "@/lib/mirrors/resolution";
import Artifact from "@/lib/models/Artifact";
import dbConnect from "@/lib/db";

export async function GET(req: Request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const artifactId = searchParams.get("artifactId");

    if (artifactId || slug) {
      const target = artifactId || slug!;
      const result = await resolveDownloadSources(target);
      if (!result) {
        return NextResponse.json({ error: "Download artifact not found" }, { status: 404 });
      }
      return NextResponse.json(result);
    }

    const artifacts = await Artifact.find({ mirrorEnabled: true })
      .select("artifactId gameSlug version artifactType filename sizeBytes sha256 r2Status vpsStatus")
      .lean();

    return NextResponse.json({ artifacts });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to query downloads";
    console.error("[Downloads API Error]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
