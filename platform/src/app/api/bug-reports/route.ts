import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import BugReport from "@/lib/models/BugReport";
import { BUG_REPORT_SOURCES, isBugReportStatus } from "@/lib/bugReports";
import { isFounderAdminEmail } from "@/lib/admin";
import { sendMail } from "@/lib/mailer";
import { userFromLauncherBearer } from "@/lib/library";
import { requireAdminSession } from "@/lib/requireAdmin";
import { recaptchaErrorMessage, verifyRecaptcha } from "@/lib/recaptcha";

const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(8000),
  source: z.enum(BUG_REPORT_SOURCES),
  pageUrl: z.string().trim().max(1000).optional().or(z.literal("")),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  submitterName: z.string().trim().max(80).optional().or(z.literal("")),
  launcherVersion: z.string().trim().max(40).optional().or(z.literal("")),
  platform: z.string().trim().max(40).optional().or(z.literal("")),
  userAgent: z.string().trim().max(500).optional().or(z.literal("")),
  recaptchaToken: z.string().optional(),
});

export async function GET(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const status = new URL(req.url).searchParams.get("status");
  const filter =
    status === "all"
      ? {}
      : status && isBugReportStatus(status)
      ? { status }
      : { status: { $ne: "resolved" } };

  await dbConnect();
  const items = await BugReport.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = createSchema.parse(body);

    // Site form should send reCAPTCHA; launcher may omit (token absent → skip when disabled).
    if (data.source === "website" || data.recaptchaToken) {
      const captcha = await verifyRecaptcha(data.recaptchaToken, "bug_report");
      if (!captcha.ok) {
        return NextResponse.json({ error: recaptchaErrorMessage(captcha.reason) }, { status: 400 });
      }
    }

    const session = await getServerSession(authOptions);
    const launcherUser = session?.user?.id ? null : await userFromLauncherBearer(req);
    const submittedBy = session?.user?.id || launcherUser?._id?.toString() || null;

    await dbConnect();
    const report = await BugReport.create({
      title: data.title,
      description: data.description,
      source: data.source,
      pageUrl: data.pageUrl || null,
      contactEmail: data.contactEmail ? data.contactEmail.toLowerCase() : null,
      submitterName:
        data.submitterName ||
        session?.user?.username ||
        launcherUser?.username ||
        null,
      submittedBy,
      launcherVersion: data.launcherVersion || null,
      platform: data.platform || null,
      userAgent: data.userAgent || req.headers.get("user-agent")?.slice(0, 500) || null,
      status: "open",
    });

    const founder = "ryanschumacher@themediashop.co";
    if (isFounderAdminEmail(founder)) {
      try {
        await sendMail(
          founder,
          `Bug report (${data.source}): ${data.title}`,
          `<p><strong>${data.title}</strong></p>
           <p>Source: ${data.source}</p>
           ${data.pageUrl ? `<p>Page: ${data.pageUrl}</p>` : ""}
           <p>${data.description.slice(0, 800)}</p>
           <p>Review in Admin → Bugs.</p>`
        );
      } catch (err) {
        console.error("Failed to notify founder of bug report:", err);
      }
    }

    return NextResponse.json({ success: true, id: report._id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Bug report create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
