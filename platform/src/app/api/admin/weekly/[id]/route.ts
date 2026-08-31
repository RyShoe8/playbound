import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import WeeklyIssue from "@/lib/models/WeeklyIssue";
import { getGame } from "@/lib/catalog";
import { newsletterEmailDraftSchema } from "@/lib/newsletterEmailSchema";
import { requireAdminSession } from "@/lib/requireAdmin";
import { buildIssueFromDate, saveNewsletterFooterTemplate } from "@/lib/weekly";

const updateSchema = z.object({
  gameSlug: z.string().trim().min(1).max(80),
  publishedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  published: z.boolean().optional().default(true),
  emailDraft: newsletterEmailDraftSchema.optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { id } = await params;
    const body = updateSchema.parse(await req.json());
    const game = await getGame(body.gameSlug, { includeUnpublished: true });
    if (!game) {
      return NextResponse.json({ error: "Unknown game slug" }, { status: 400 });
    }

    const built = buildIssueFromDate(body.publishedAt, body.gameSlug);
    await dbConnect();

    const existing = await WeeklyIssue.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (built.slug !== existing.slug) {
      const clash = await WeeklyIssue.findOne({
        $or: [{ slug: built.slug }, { year: built.year, week: built.week }],
        _id: { $ne: existing._id },
      }).lean();
      if (clash) {
        return NextResponse.json(
          { error: "An issue already exists for that week or slug" },
          { status: 409 }
        );
      }
    }

    existing.slug = built.slug;
    existing.year = built.year;
    existing.week = built.week;
    existing.gameSlug = built.gameSlug;
    existing.publishedAt = built.publishedAt;
    existing.published = body.published !== false;
    if (body.emailDraft !== undefined) {
      existing.emailDraft = body.emailDraft;
      existing.markModified("emailDraft");
    }
    await existing.save();

    if (body.emailDraft?.footer) {
      await saveNewsletterFooterTemplate(body.emailDraft.footer);
    }

    // listWeeklyIssues is cached now; drop it so the change shows at once.
    revalidateTag("weekly", { expire: 0 });
    return NextResponse.json({ success: true, slug: existing.slug, id: String(existing._id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin update weekly error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { id } = await params;
    await dbConnect();
    const doc = await WeeklyIssue.findByIdAndDelete(id);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // listWeeklyIssues is cached now; drop it so the change shows at once.
    revalidateTag("weekly", { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin delete weekly error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
