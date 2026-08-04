import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import WeeklyIssue from "@/lib/models/WeeklyIssue";
import { getGame } from "@/lib/catalog";
import { requireAdminSession } from "@/lib/requireAdmin";
import { buildIssueFromDate, listWeeklyIssuesAdmin } from "@/lib/weekly";

const createSchema = z.object({
  gameSlug: z.string().trim().min(1).max(80),
  publishedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  published: z.boolean().optional().default(true),
});

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  const issues = await listWeeklyIssuesAdmin();
  return NextResponse.json({ issues });
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = createSchema.parse(await req.json());
    const game = await getGame(body.gameSlug, { includeUnpublished: true });
    if (!game) {
      return NextResponse.json({ error: "Unknown game slug" }, { status: 400 });
    }

    const built = buildIssueFromDate(body.publishedAt, body.gameSlug);
    await dbConnect();

    const clash = await WeeklyIssue.findOne({
      $or: [{ slug: built.slug }, { year: built.year, week: built.week }],
    }).lean();
    if (clash) {
      return NextResponse.json(
        { error: "An issue already exists for that week or slug" },
        { status: 409 }
      );
    }

    const doc = await WeeklyIssue.create({
      ...built,
      published: body.published !== false,
    });

    return NextResponse.json({ success: true, slug: doc.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin create weekly error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
