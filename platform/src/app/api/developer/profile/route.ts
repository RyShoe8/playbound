import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import Developer from "@/lib/models/Developer";
import { requireDeveloperOrAdminSession, listManageableDevelopers, canEditDeveloper } from "@/lib/developerAccess";
import { firstZodErrorMessage } from "@/lib/zodError";

const developerProfileUpdateSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  tagline: z.string().trim().max(300).optional().default(""),
  about: z.string().trim().max(8000).optional().default(""),
  founded: z.number().int().min(1970).max(2100).optional().default(0),
  location: z.string().trim().max(200).optional().default(""),
  website: z.union([z.string().trim().url().max(500), z.literal(""), z.null()]).optional().transform((v) => (!v ? "" : v)),
  artHue: z.number().min(0).max(360).optional().default(210),
});

export async function GET() {
  const { user, error } = await requireDeveloperOrAdminSession();
  if (error) return error;

  try {
    const developers = await listManageableDevelopers(user.id);
    return NextResponse.json({ developers });
  } catch (err) {
    console.error("[api/developer/profile] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { user, error } = await requireDeveloperOrAdminSession();
  if (error) return error;

  try {
    const raw = await req.json();
    const data = developerProfileUpdateSchema.parse(raw);

    await dbConnect();
    const existing = await Developer.findOne({ slug: data.slug });
    if (!existing) {
      return NextResponse.json({ error: "Developer profile not found" }, { status: 404 });
    }

    if (!canEditDeveloper(user, existing)) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to edit this profile" },
        { status: 403 }
      );
    }

    existing.name = data.name;
    existing.tagline = data.tagline;
    existing.about = data.about;
    existing.founded = data.founded;
    existing.location = data.location;
    existing.website = data.website;
    existing.artHue = data.artHue;
    await existing.save();

    revalidateTag("developers", { expire: 0 });
    revalidatePath(`/developers/${data.slug}`);

    return NextResponse.json({ success: true, developer: existing });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 422 });
    }
    console.error("[api/developer/profile] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
