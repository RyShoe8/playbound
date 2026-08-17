import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import MirrorEvent from "@/lib/models/MirrorEvent";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();

    const events = await MirrorEvent.find({}).sort({ createdAt: -1 }).limit(50).lean();
    return NextResponse.json({ events });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load events";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
