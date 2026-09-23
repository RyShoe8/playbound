import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import ControlProfile from "@/lib/models/ControlProfile";
import { controlProfileSchema } from "@/lib/controlProfiles/schema";
import { requireAdminSession } from "@/lib/requireAdmin";
import { validateProfileTarget } from "@/lib/controlProfiles/validateTarget";

/** ?gameSlug=<slug> lists that game's profiles (draft/testing/verified); no query lists everything, newest first. */
export async function GET(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const gameSlug = new URL(req.url).searchParams.get("gameSlug");
  await dbConnect();
  const query = gameSlug ? { gameSlug } : {};
  const profiles = await ControlProfile.find(query).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ profiles });
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = controlProfileSchema.parse(await req.json());
    await dbConnect();
    const targetError = await validateProfileTarget(body.gameSlug, body.editionSlug);
    if (targetError) return NextResponse.json({ error: targetError }, { status: 400 });
    const doc = await ControlProfile.create(body);

    revalidateTag("control-profiles", { expire: 0 });
    return NextResponse.json({ success: true, id: doc._id.toString() }, { status: 201 });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === 11000) {
      return NextResponse.json({ error: "This game and edition already have a verified profile" }, { status: 409 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin create control profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
