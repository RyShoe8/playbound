import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import BugReport from "@/lib/models/BugReport";
import { BUG_REPORT_STATUSES, isTerminalBugStatus } from "@/lib/bugReports";
import { requireAdminSession } from "@/lib/requireAdmin";

const patchSchema = z.object({
  status: z.enum(BUG_REPORT_STATUSES).optional(),
  adminNotes: z.string().trim().max(4000).optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  try {
    const body = patchSchema.parse(await req.json());
    await dbConnect();

    const report = await BugReport.findById(id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.adminNotes !== undefined) {
      report.adminNotes = body.adminNotes || null;
    }
    if (body.status) {
      report.status = body.status;
      if (isTerminalBugStatus(body.status)) {
        report.resolvedAt = new Date();
        report.moderatorId = session!.user.id;
      } else if (body.status === "open" || body.status === "reviewing") {
        report.resolvedAt = null;
      }
      if (body.status === "reviewing" || isTerminalBugStatus(body.status)) {
        report.moderatorId = session!.user.id;
      }
    }

    await report.save();
    return NextResponse.json({ success: true, status: report.status });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    console.error("Bug report patch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
