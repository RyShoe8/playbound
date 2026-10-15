import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";
import { INSTALLATION_UPDATE_KEYS } from "@/lib/gameHost/installationKeys";
import { UPDATE_FAILURE_EVENT } from "@/lib/gameHost/updateFailureReceipt";

const schema = z.object({ failures: z.array(z.object({
  id: z.string().uuid(), key: z.enum(INSTALLATION_UPDATE_KEYS),
  action: z.enum(["update", "rollback"]), status: z.enum(["failed", "interrupted"]),
  message: z.string().max(1000), beforeBuild: z.string().max(120).optional(),
})).min(1).max(10) }).strict();

export const maxDuration = 30;
export async function POST(request: Request) {
  const secret = process.env.GAME_HOST_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (!secret || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Bound body parsing even for an authenticated but malfunctioning agent.
  let raw = "", size = 0;
  const reader = request.body?.getReader(), decoder = new TextDecoder();
  if (reader) {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if ((size += chunk.value.byteLength) > 20_000) {
          await reader.cancel();
          return NextResponse.json({ error: "Payload too large" }, { status: 413 });
        }
        raw += decoder.decode(chunk.value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
  }
  const input = schema.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!input.success) return NextResponse.json({ error: "Invalid update failure batch" }, { status: 400 });
  const acknowledged: string[] = [];
  for (const failure of input.data.failures) {
    try {
      await saveEvent({ event: UPDATE_FAILURE_EVENT, properties: {
        source: "website", area: "hosting", code: failure.status === "interrupted" ? "UPDATE_INTERRUPTED" : "UPDATE_FAILED",
        gameSlug: failure.key === "0ad" ? "0-ad" : failure.key, profileKey: failure.key,
        phase: `installation_${failure.action}`, message: failure.message,
        installationUpdateJobId: failure.id, version: failure.beforeBuild,
      } });
      acknowledged.push(failure.id);
    } catch {
      // Partial successes are acknowledged; remaining durable jobs retry later.
      break;
    }
  }
  return NextResponse.json({ acknowledged }, { headers: { "Cache-Control": "no-store" } });
}
