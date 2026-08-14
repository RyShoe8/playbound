import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import HardwareCpu from "@/lib/models/HardwareCpu";
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
  const cpus = await HardwareCpu.find({}).sort({ displayName: 1 }).limit(5000).lean();
  return NextResponse.json({ cpus });
}

const patchSchema = z.object({
  id: z.string().min(1),
  tier: z.enum([...PERFORMANCE_TIERS, "unknown"] as [string, ...string[]]).optional(),
  aliases: z.array(z.string().max(200)).max(40).optional(),
  displayName: z.string().max(200).optional(),
});

const postSchema = z.object({
  displayName: z.string().min(2).max(200),
  manufacturer: z.string().max(80).optional(),
  tier: z.enum([...PERFORMANCE_TIERS, "unknown"] as [string, ...string[]]),
});

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = postSchema.parse(await req.json());
    await dbConnect();
    const identityKey = identityKeyFromName(body.displayName);
    const existing = await HardwareCpu.findOne({ identityKey });
    if (existing) {
      return NextResponse.json({ error: "SKU already exists" }, { status: 409 });
    }
    const cpu = await HardwareCpu.create({
      identityKey,
      manufacturer: body.manufacturer || null,
      model: body.displayName,
      displayName: body.displayName,
      tier: body.tier,
      source: "admin",
    });
    return NextResponse.json({ cpu }, { status: 201 });
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
    const doc = await HardwareCpu.findById(body.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (body.tier) doc.tier = body.tier;
    if (body.aliases) doc.aliases = body.aliases;
    if (body.displayName) doc.displayName = body.displayName;
    doc.source = "admin";
    await doc.save();
    return NextResponse.json({ cpu: doc });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
