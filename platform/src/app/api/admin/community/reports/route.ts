import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import ContentReport from "@/lib/models/ContentReport";
import { REPORT_STATUSES } from "@/lib/discussion/reportConstants";
import { writeAuditLog } from "@/lib/discussion/permissions";

export async function GET(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "open";

  await dbConnect();
  const query =
    status === "all"
      ? {}
      : { status: REPORT_STATUSES.includes(status as (typeof REPORT_STATUSES)[number]) ? status : "open" };

  const reports = await ContentReport.find(query).sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json({ reports });
}

const patchSchema = z.object({
  status: z.enum(["open", "reviewing", "resolved", "dismissed"]),
  resolutionNote: z.string().max(2000).optional(),
});

export async function PATCH(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const body = await req.json();
    const id = z.string().parse(body.id);
    const raw = patchSchema.parse(body);
    await dbConnect();
    const report = await ContentReport.findById(id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    report.status = raw.status;
    report.resolutionNote = raw.resolutionNote ?? report.resolutionNote;
    report.moderatorId = session.user.id as unknown as typeof report.moderatorId;
    if (raw.status === "resolved" || raw.status === "dismissed") {
      report.resolvedAt = new Date();
    }
    await report.save();

    await writeAuditLog({
      actorId: session.user.id,
      actorUsername: session.user.username,
      action: `report_${raw.status}`,
      targetType: "report",
      targetId: String(report._id),
      note: raw.resolutionNote,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    console.error("Report patch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
