import { NextResponse } from "next/server";
import { recordDownloadTelemetry } from "@/lib/mirrors/telemetry";

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    if (!payload || !payload.artifactId || !payload.result) {
      return NextResponse.json(
        { error: "Invalid telemetry payload (artifactId and result required)" },
        { status: 400 }
      );
    }

    const result = await recordDownloadTelemetry(payload);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to record telemetry";
    console.error("[Download Telemetry API Error]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
