import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import ControlProfile from "@/lib/models/ControlProfile";
import { controlProfileSchema } from "@/lib/controlProfiles/schema";
import { requireAdminSession } from "@/lib/requireAdmin";
import { validateProfileTarget } from "@/lib/controlProfiles/validateTarget";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  await dbConnect();
  const doc = await ControlProfile.findById(id).lean();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ profile: doc });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { id } = await params;
    const body = controlProfileSchema.parse(await req.json());

    await dbConnect();
    const targetError = await validateProfileTarget(body.gameSlug, body.editionSlug);
    if (targetError) return NextResponse.json({ error: targetError }, { status: 400 });
    const doc = await ControlProfile.findByIdAndUpdate(id, { $set: body }, { returnDocument: "after" });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    revalidateTag("control-profiles", { expire: 0 });
    return NextResponse.json({ success: true, id: doc._id.toString() });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === 11000) {
      return NextResponse.json({ error: "This game and edition already have a verified profile" }, { status: 409 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin update control profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { id } = await params;
    await dbConnect();
    const doc = await ControlProfile.findByIdAndDelete(id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    revalidateTag("control-profiles", { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin delete control profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
