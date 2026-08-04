import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Developer from "@/lib/models/Developer";
import CatalogGame from "@/lib/models/CatalogGame";
import CatalogMod from "@/lib/models/CatalogMod";
import { developerPayloadSchema } from "@/lib/developerPayload";
import { requireAdminSession } from "@/lib/requireAdmin";

/** Games and mods both credit a developer by slug. */
async function countReferences(slug: string): Promise<{ games: number; mods: number }> {
  const [games, mods] = await Promise.all([
    CatalogGame.countDocuments({ developerSlug: slug }),
    CatalogMod.countDocuments({ developerSlug: slug }),
  ]);
  return { games, mods };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    const body = developerPayloadSchema.parse(await req.json());

    await dbConnect();

    const isRename = body.slug !== slug;
    if (isRename) {
      const clash = await Developer.findOne({ slug: body.slug }).lean();
      if (clash) {
        return NextResponse.json({ error: "New slug already exists" }, { status: 409 });
      }
    }

    const doc = await Developer.findOneAndUpdate({ slug }, { $set: body }, { new: true });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Games and mods store the developer slug rather than an id, so a rename
    // would orphan every credit — the profile link would 404 and the developer
    // page would show none of their games. Cascade it in the same request.
    let cascaded = { games: 0, mods: 0 };
    if (isRename) {
      const [games, mods] = await Promise.all([
        CatalogGame.updateMany({ developerSlug: slug }, { $set: { developerSlug: body.slug } }),
        CatalogMod.updateMany({ developerSlug: slug }, { $set: { developerSlug: body.slug } }),
      ]);
      cascaded = { games: games.modifiedCount ?? 0, mods: mods.modifiedCount ?? 0 };
    }

    return NextResponse.json({ success: true, slug: doc.slug, cascaded });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin update developer error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    await dbConnect();

    // Deleting a referenced developer would leave games crediting a profile
    // that 404s, with no way to notice from the games list. Refuse and say what
    // is still pointing at it — unpublishing is the way to hide one.
    const refs = await countReferences(slug);
    if (refs.games > 0 || refs.mods > 0) {
      const parts = [
        refs.games > 0 ? `${refs.games} game${refs.games === 1 ? "" : "s"}` : null,
        refs.mods > 0 ? `${refs.mods} mod${refs.mods === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      return NextResponse.json(
        {
          error: `Still used by ${parts.join(" and ")}. Reassign them first, or untick Published to hide this developer.`,
        },
        { status: 409 }
      );
    }

    const doc = await Developer.findOneAndDelete({ slug });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin delete developer error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
