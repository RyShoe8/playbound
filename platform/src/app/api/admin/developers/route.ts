import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Developer from "@/lib/models/Developer";
import { developerPayloadSchema } from "@/lib/developerPayload";
import { requireAdminSession } from "@/lib/requireAdmin";
import { listAllDevelopers } from "@/lib/developers";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  const developers = await listAllDevelopers();
  return NextResponse.json({ developers });
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = developerPayloadSchema.parse(await req.json());

    await dbConnect();
    const exists = await Developer.findOne({ slug: body.slug }).lean();
    if (exists) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    const doc = await Developer.create(body);
    return NextResponse.json({ success: true, slug: doc.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin create developer error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
