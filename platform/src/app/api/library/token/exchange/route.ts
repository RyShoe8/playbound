import { NextResponse } from "next/server";
import { z } from "zod";
import { exchangeLauncherHandoffCode } from "@/lib/library";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

const bodySchema = z.object({
  code: z.string().min(8).max(128),
});

/**
 * Exchange a one-time handoff code for a durable launcher bearer.
 * Called only from the desktop app — never expose the bearer in a browser URL.
 */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  try {
    const result = await exchangeLauncherHandoffCode(parsed.data.code);
    if (!result) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    if (result.firstConnect) {
      void saveEvent({
        event: "launcher_connected",
        properties: { firstConnect: true },
        userId: result.userId,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      token: result.token,
      createdAt: new Date().toISOString(),
      firstConnect: result.firstConnect,
    });
  } catch (error) {
    console.error("Launcher handoff exchange error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
