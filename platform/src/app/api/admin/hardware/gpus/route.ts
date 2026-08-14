import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import HardwareGpu from "@/lib/models/HardwareGpu";
import { z } from "zod";
import { PERFORMANCE_TIERS } from "@/lib/hardware/types";
import { identityKeyFromName } from "@/lib/hardware/normalize";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();
  const gpus = await HardwareGpu.find({}).sort({ displayName: 1 }).limit(5000).lean();
  return NextResponse.json({ gpus });
}

const patchSchema = z.object({
  id: z.string().min(1),
  tier: z.enum([...PERFORMANCE_TIERS, "unknown"] as [string, ...string[]]).optional(),
  aliases: z.array(z.string().max(200)).max(40).optional(),
  displayName: z.string().max(200).optional(),
  typicalVramMB: z.number().int().positive().nullable().optional(),
});

const postSchema = z.object({
  displayName: z.string().min(2).max(200),
  manufacturer: z.string().max(80).optional(),
  tier: z.enum([...PERFORMANCE_TIERS, "unknown"] as [string, ...string[]]),
  typicalVramMB: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = postSchema.parse(await req.json());
    await dbConnect();
    const identityKey = identityKeyFromName(body.displayName);
    const existing = await HardwareGpu.findOne({ identityKey });
    if (existing) {
      return NextResponse.json({ error: "SKU already exists" }, { status: 409 });
    }
    const gpu = await HardwareGpu.create({
      identityKey,
      manufacturer: body.manufacturer || null,
      model: body.displayName,
      displayName: body.displayName,
      typicalVramMB: body.typicalVramMB ?? null,
      tier: body.tier,
      source: "admin",
    });
    return NextResponse.json({ gpu }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = patchSchema.parse(await req.json());
    await dbConnect();
    const doc = await HardwareGpu.findById(body.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (body.tier) doc.tier = body.tier;
    if (body.aliases) doc.aliases = body.aliases;
    if (body.displayName) doc.displayName = body.displayName;
    if (body.typicalVramMB !== undefined) doc.typicalVramMB = body.typicalVramMB;
    doc.source = "admin";
    await doc.save();
    return NextResponse.json({ gpu: doc });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
