import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { checkRateLimit } from "@/lib/discussion/rateLimit";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";
import { isTelemetryExcludedPath } from "@/lib/telemetry/types";

export const runtime = "nodejs";

const ingestSchema = z.object({
  event: z.string().min(1).max(128),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  timestamp: z.string().datetime().or(z.string().min(1)),
  sessionId: z.string().min(8).max(128),
  anonymousId: z.string().min(8).max(128),
  userId: z.string().min(1).max(128).nullable().optional(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

function withCors(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.headers.set(key, value);
  }
  return res;
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function clientCountry(req: Request): string | null {
  return (
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-vercel-ip-country") ||
    null
  );
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return withCors(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const parsed = ingestSchema.safeParse(json);
  if (!parsed.success) {
    return withCors(
      NextResponse.json(
        { error: "Malformed request", details: parsed.error.flatten() },
        { status: 400 }
      )
    );
  }

  const body = parsed.data;
  const props = body.properties || {};
  const path =
    typeof props.path === "string"
      ? props.path.split("?")[0]
      : typeof props.url === "string"
        ? (() => {
            try {
              return new URL(props.url as string).pathname;
            } catch {
              return "";
            }
          })()
        : "";

  if (path && isTelemetryExcludedPath(path)) {
    return withCors(NextResponse.json({ ok: true, skipped: true }));
  }

  const ip = clientIp(req);

  try {
    await dbConnect();
    const limit = await checkRateLimit(`telemetry:${ip}`, {
      max: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) {
      return withCors(
        NextResponse.json(
          { error: "Too many events" },
          {
            status: 429,
            headers: { "Retry-After": String(limit.retryAfterSec) },
          }
        )
      );
    }

    await saveEvent({
      event: body.event,
      properties: props,
      timestamp: body.timestamp,
      sessionId: body.sessionId,
      anonymousId: body.anonymousId,
      userId: body.userId ?? null,
      ip,
      country: clientCountry(req),
      userAgent: req.headers.get("user-agent"),
    });
    return withCors(NextResponse.json({ ok: true }));
  } catch (err) {
    console.error("[telemetry] save failed", err);
    // Fail-soft to clients — do not leak internals.
    return withCors(NextResponse.json({ ok: true }));
  }
}
