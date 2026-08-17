import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { getGame } from "@/lib/catalog";
import { requireAdminSession } from "@/lib/requireAdmin";
import { firstZodErrorMessage } from "@/lib/zodError";
import {
  GAME_HEALTH_AREAS,
  GAME_HEALTH_STATUSES,
  normalizeOpsHealth,
} from "@/lib/admin/gameHealth";

const bodySchema = z.object({
  area: z.enum(GAME_HEALTH_AREAS),
  status: z.enum(GAME_HEALTH_STATUSES),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    const body = bodySchema.parse(await req.json());
    const field = `opsHealth.${body.area}`;

    await dbConnect();
    let doc = await CatalogGame.findOneAndUpdate(
      { slug },
      { $set: { [field]: body.status } },
      { returnDocument: "after" }
    ).lean();

    if (!doc) {
      const existingGame = await getGame(slug);
      if (!existingGame) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      const created = await CatalogGame.create({
        ...existingGame,
        opsHealth: {
          ...normalizeOpsHealth(existingGame.opsHealth),
          [body.area]: body.status,
        },
      });
      doc = created.toObject();
    }

    return NextResponse.json({
      ok: true,
      slug,
      opsHealth: normalizeOpsHealth((doc as { opsHealth?: unknown }).opsHealth),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 400 });
    }
    console.error("Admin game health update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
