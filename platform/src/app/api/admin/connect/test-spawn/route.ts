import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { triggerTestSpawn } from "@/lib/gameHost/client";
import { recordSpawnTestSamples } from "@/lib/gameHost/spawnTestSamples";

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    gameSlug?: string;
    all?: boolean;
  };

  const result = await triggerTestSpawn({
    gameSlug: body.gameSlug,
    all: Boolean(body.all),
  });

  let samplesRecorded = 0;
  let sampleWarning: string | undefined;
  if (result.ok) {
    try {
      samplesRecorded = await recordSpawnTestSamples(result.result, body.gameSlug);
    } catch (err) {
      sampleWarning = "Spawn test completed, but its resource sample could not be saved";
      console.error("[test-spawn] resource sample persistence failed", err);
    }
  }

  return NextResponse.json({ ...result, samplesRecorded, ...(sampleWarning ? { sampleWarning } : {}) }, {
    status: result.ok ? 200 : result.result ? 409 : 502,
  });
}
