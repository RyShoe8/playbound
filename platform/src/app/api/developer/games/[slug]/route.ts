import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { requireDeveloperOrAdminSession, canEditGame } from "@/lib/developerAccess";
import { developerGamePayloadSchema } from "@/lib/developerGamePayload";
import { firstZodErrorMessage } from "@/lib/zodError";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { user, error } = await requireDeveloperOrAdminSession();
  if (error) return error;

  const { slug } = await params;
  await dbConnect();

  const game = await CatalogGame.findOne({ slug }).lean();
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const allowed = await canEditGame(user, game);
  if (!allowed) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to manage this game" },
      { status: 403 }
    );
  }

  return NextResponse.json({ game });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { user, error } = await requireDeveloperOrAdminSession();
  if (error) return error;

  const { slug } = await params;
  await dbConnect();

  const game = await CatalogGame.findOne({ slug });
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const allowed = await canEditGame(user, game);
  if (!allowed) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to manage this game" },
      { status: 403 }
    );
  }

  try {
    const raw = await req.json();
    const payload = developerGamePayloadSchema.parse(raw);

    // Apply only developer-controlled fields.
    // Editorial fields (qualityBar, whyWePickedIt, thatOneThing, bestFor, notFor,
    // access, status, published, etc.) are strictly excluded by the schema and cannot be modified.
    const updated = await CatalogGame.findOneAndUpdate(
      { slug },
      {
        $set: {
          ...payload,
          managedBy: "developer",
        },
      },
      { returnDocument: "after" }
    ).lean();

    revalidateTag("catalog", { expire: 0 });
    revalidateTag("games", { expire: 0 });
    revalidatePath(`/games/${slug}`);

    return NextResponse.json({ success: true, game: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 422 });
    }
    console.error(`[api/developer/games/${slug}] update error:`, err);
    return NextResponse.json({ error: "Failed to update game" }, { status: 500 });
  }
}
