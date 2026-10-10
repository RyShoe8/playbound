import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { checkRateLimit } from "@/lib/discussion/rateLimit";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";
import { isTelemetryExcludedPath } from "@/lib/telemetry/types";
import { SITE_URL } from "@/lib/site";
import { userFromLauncherBearer } from "@/lib/library";

const MAX_PROP_KEYS = 40;
const MAX_PROP_JSON = 8_000;

/**
 * Event names are lowercase snake_case identifiers (`launcher_install`).
 * Rejecting anything else keeps stray or hostile names out of the event
 * dropdown and Top events; every emitter in the launcher and platform already
 * conforms.
 */
const EVENT_NAME = /^[a-z][a-z0-9_]{1,63}$/;

const ingestSchema = z.object({
  event: z.string().regex(EVENT_NAME, "Event names are lowercase snake_case"),
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

/** Longest single string kept. Launcher failure events carry ~2 KB stderr tails. */
const MAX_STRING = 2_100;

/**
 * Bound the size of an event's properties without losing the event.
 *
 * Long strings are shortened first. If the object is still over budget the
 * largest values are dropped one at a time (and named in `_droppedKeys`), so an
 * oversized event keeps its identifying fields — game, edition, code — instead
 * of being replaced wholesale by a marker.
 */
function capProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props).slice(0, MAX_PROP_KEYS)) {
    out[k] = typeof v === "string" && v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}…` : v;
  }
  if (JSON.stringify(out).length <= MAX_PROP_JSON) return out;

  const dropped: string[] = [];
  const bySize = Object.keys(out).sort(
    (a, b) => JSON.stringify(out[b] ?? null).length - JSON.stringify(out[a] ?? null).length
  );
  for (const key of bySize) {
    if (JSON.stringify(out).length <= MAX_PROP_JSON - 200) break;
    delete out[key];
    dropped.push(key);
  }
  out._droppedKeys = dropped.slice(0, 20);
  return out;
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
    /*
     * Two buckets. Per installation (anonymousId) is the fair one: a launcher
     * burst of install, launch and library events must not be dropped, and one
     * household behind a shared address must not starve its neighbours. The
     * per-IP bucket is only a generous backstop against a flood from one source.
     */
    const [perClient, perIp] = await Promise.all([
      checkRateLimit(`telemetry:anon:${body.anonymousId}`, { max: 120, windowMs: 60 * 1000 }),
      checkRateLimit(`telemetry:ip:${ip}`, { max: 600, windowMs: 60 * 1000 }),
    ]);
    const limit = !perClient.ok ? perClient : perIp;
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
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("[telemetry] save failed", err);
    // A launcher install must retry if its write failed. A success response
    // would persist the client receipt and permanently hide the missing event.
    return withCors(req, NextResponse.json({ error: "Telemetry unavailable" }, { status: 503 }));
  }
}
