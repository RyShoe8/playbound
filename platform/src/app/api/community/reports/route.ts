import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import ContentReport from "@/lib/models/ContentReport";
import { REPORT_REASONS, REPORT_TARGET_TYPES } from "@/lib/discussion/reportConstants";
import { loadPosterGate } from "@/lib/discussion/permissions";
import { assertReportRateLimit } from "@/lib/discussion/rateLimit";
import { recaptchaErrorMessage, verifyRecaptcha } from "@/lib/recaptcha";

const schema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(1000).optional(),
  recaptchaToken: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const raw = schema.parse(await req.json());
    const captcha = await verifyRecaptcha(raw.recaptchaToken, "discussion_report");
    if (!captcha.ok) {
      return NextResponse.json({ error: recaptchaErrorMessage(captcha.reason) }, { status: 400 });
    }

    await dbConnect();
    const gate = await loadPosterGate(session.user.id);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const rate = await assertReportRateLimit(session.user.id);
    if (!rate.ok) {
      return NextResponse.json({ error: rate.error }, { status: 429 });
    }

    await ContentReport.create({
      reporterId: session.user.id,
      targetType: raw.targetType,
      targetId: raw.targetId,
      reason: raw.reason,
      details: raw.details ?? null,
      status: "open",
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Report create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
