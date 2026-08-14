import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { checkRateLimit } from "@/lib/discussion/rateLimit";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";
import { isTelemetryExcludedPath } from "@/lib/telemetry/types";
import { SITE_URL } from "@/lib/site";
import { userFromLauncherBearer } from "@/lib/library";

export const runtime = "nodejs";

const MAX_PROP_KEYS = 40;
const MAX_PROP_JSON = 8_000;

const ingestSchema = z.object({
  event: z.string().min(1).max(128),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  timestamp: z.string().datetime().or(z.string().min(1)),
  sessionId: z.string().min(8).max(128),
  anonymousId: z.string().min(8).max(128),
  // Accepted for wire compatibility but ignored — never trust client userId.
  userId: z.string().min(1).max(128).nullable().optional(),
});

function corsOriginFor(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  try {
    const u = new URL(origin);
    const site = new URL(SITE_URL);
    if (u.origin === site.origin) return u.origin;
    if (u.hostname.endsWith(".vercel.app") && u.hostname.includes("playbound")) {
      return u.origin;
    }
    if (
      (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      process.env.NODE_ENV !== "production"
    ) {
      return u.origin;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function withCors(req: Request, res: NextResponse): NextResponse {
  const allow = corsOriginFor(req);
  if (allow) {
    res.headers.set("Access-Control-Allow-Origin", allow);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
    res.headers.set("Access-Control-Max-Age", "86400");
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

function capProperties(props: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(props).slice(0, MAX_PROP_KEYS);
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    out[k] = v;
  }
  const json = JSON.stringify(out);
  if (json.length <= MAX_PROP_JSON) return out;
  return { _truncated: true, keys: Object.keys(out).slice(0, 10) };
}

export async function OPTIONS(req: Request) {
  return withCors(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return withCors(req, NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const parsed = ingestSchema.safeParse(json);
  if (!parsed.success) {
    return withCors(
      req,
      NextResponse.json(
        { error: "Malformed request", details: parsed.error.flatten() },
        { status: 400 }
      )
    );
  }

  const body = parsed.data;
  const props = capProperties(body.properties || {});
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
    return withCors(req, NextResponse.json({ ok: true, skipped: true }));
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
        req,
        NextResponse.json(
          { error: "Too many events" },
          {
            status: 429,
            headers: { "Retry-After": String(limit.retryAfterSec) },
          }
        )
      );
    }

    // Prefer authenticated session or launcher Bearer; never trust client-supplied userId.
    let userId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      userId = session?.user?.id ?? null;
    } catch {
      userId = null;
    }
    if (!userId) {
      try {
        const launcherUser = await userFromLauncherBearer(req);
        userId = launcherUser?._id ? String(launcherUser._id) : null;
      } catch {
        userId = null;
      }
    }

    await saveEvent({
      event: body.event,
      properties: props,
      timestamp: body.timestamp,
      sessionId: body.sessionId,
      anonymousId: body.anonymousId,
      userId,
      ip,
      country: clientCountry(req),
      userAgent: req.headers.get("user-agent"),
    });
    return withCors(req, NextResponse.json({ ok: true }));
  } catch (err) {
    console.error("[telemetry] save failed", err);
    // Fail-soft to clients — do not leak internals.
    return withCors(req, NextResponse.json({ ok: true }));
  }
}
