import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import TelemetryEvent from "@/lib/models/TelemetryEvent";

export const runtime = "nodejs";

const querySchema = z.object({
  event: z.string().min(1).max(128).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    event: url.searchParams.get("event") || undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
    page: url.searchParams.get("page") || 1,
    limit: url.searchParams.get("limit") || 50,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { event, from, to, page, limit } = parsed.data;
  const filter: Record<string, unknown> = {};
  if (event) filter.event = event;

  const createdAt: { $gte?: Date; $lte?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) createdAt.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) createdAt.$lte = d;
  }
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;

  await dbConnect();

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TelemetryEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TelemetryEvent.countDocuments(filter),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}
