import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { launcherInstallSchema } from "@/lib/gamePayload";
import CatalogGame from "@/lib/models/CatalogGame";
import { requireAdminSession } from "@/lib/requireAdmin";
import { firstZodErrorMessage } from "@/lib/zodError";

/**
 * Intentionally isolated from the general game editor route. Install recipes
 * are operational data, so correcting one must never rewrite editorial game
 * data from a stale full-form submission.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    const body = z.object({ launcherInstall: launcherInstallSchema.nullable() }).parse(await req.json());

    await dbConnect();
    const doc = await CatalogGame.findOneAndUpdate(
      { slug },
      { $set: { launcherInstall: body.launcherInstall } },
      { returnDocument: "after", projection: { slug: 1, launcherInstall: 1 } }
    ).lean();

    if (!doc) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    revalidateTag("catalog", { expire: 0 });
    return NextResponse.json({ success: true, slug: doc.slug, launcherInstall: doc.launcherInstall });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 400 });
    }
    console.error("Admin launcher install update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
