import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogMod from "@/lib/models/CatalogMod";
import { canEditAssignedItem, requireDeveloperOrAdminSession } from "@/lib/developerAccess";

const payload = z.object({
  title: z.string().trim().min(1).max(120),
  tagline: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  website: z.url().max(500),
  coverImage: z.union([z.literal(""), z.url().max(500), z.string().startsWith("/").max(500)]),
}).strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { user, error } = await requireDeveloperOrAdminSession(req);
  if (error) return error;
  await dbConnect();
  const { slug } = await params;
  const mod = await CatalogMod.findOne({ slug }).select("ownerUserId baseGameSlug").lean();
  if (!mod) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditAssignedItem(user, mod)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = payload.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  await CatalogMod.updateOne({ slug }, { $set: { ...parsed.data, coverImage: parsed.data.coverImage || null } });
  revalidateTag("mods", { expire: 0 });
  revalidatePath(`/mods/${slug}`);
  revalidatePath(`/games/${mod.baseGameSlug}`);
  return NextResponse.json({ success: true });
}
