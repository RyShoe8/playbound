import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Edition from "@/lib/models/Edition";
import { canEditAssignedItem, requireDeveloperOrAdminSession } from "@/lib/developerAccess";

const payload = z.object({
  name: z.string().trim().min(2).max(120),
  shortDescription: z.string().trim().max(300),
  description: z.string().trim().max(20000),
  website: z.union([z.literal(""), z.url().max(500)]),
  heroImage: z.union([z.literal(""), z.url().max(500), z.string().startsWith("/").max(500)]),
}).strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireDeveloperOrAdminSession(req);
  if (error) return error;
  await dbConnect();
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const edition = await Edition.findById(id).select("ownerUserId gameSlug slug").lean();
  if (!edition) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditAssignedItem(user, edition)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = payload.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });
  const { name, shortDescription, description, website, heroImage } = parsed.data;
  await Edition.updateOne({ _id: id }, { $set: {
    name, shortDescription, description,
    "links.website": website || null,
    "branding.heroImage": heroImage || null,
  } });
  revalidateTag("editions", { expire: 0 });
  revalidatePath(`/games/${edition.gameSlug}/editions/${edition.slug}`);
  return NextResponse.json({ success: true });
}
