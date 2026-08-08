import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { requireAdminSession } from "@/lib/requireAdmin";
import { firstZodErrorMessage } from "@/lib/zodError";

const bodySchema = z.object({
  complete: z.boolean(),
});

/**
 * Lightweight admin toggle for the catalog-complete checklist flag.
 * Avoids the full game PATCH + editorial publish gates.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    const body = bodySchema.parse(await req.json());

    await dbConnect();
    const doc = await CatalogGame.findOneAndUpdate(
      { slug },
      { $set: { complete: body.complete } },
      { new: true }
    ).lean();

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      slug,
      complete: Boolean(doc.complete),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 400 });
    }
    console.error("Admin game complete toggle error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
