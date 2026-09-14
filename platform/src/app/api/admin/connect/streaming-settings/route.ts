import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  getConnectSettings,
  setStreamingMetricsEnabled,
} from "@/lib/connect/connectSettings";
import { firstZodErrorMessage } from "@/lib/zodError";

const patchSchema = z.object({
  streamingMetricsEnabled: z.boolean(),
});

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  try {
    const settings = await getConnectSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("Connect streaming-settings GET failed:", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  try {
    const body = patchSchema.parse(await req.json());
    const settings = await setStreamingMetricsEnabled(body.streamingMetricsEnabled);
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 400 });
    }
    console.error("Connect streaming-settings PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
