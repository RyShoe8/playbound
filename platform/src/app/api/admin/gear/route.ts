import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const data = await req.json();
    await dbConnect();
    const gear = await Gear.create(data);
    // Publish immediately rather than after the 300s read window.
    revalidateTag("gear", { expire: 0 });
    return NextResponse.json(gear);
  } catch (error: unknown) {
    console.error("Create gear failed:", error);
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: number }).code
        : undefined;
    if (code === 11000) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
