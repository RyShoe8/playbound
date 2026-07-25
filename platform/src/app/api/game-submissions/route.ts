import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import GameSubmission from "@/lib/models/GameSubmission";
import { isFounderAdminEmail } from "@/lib/admin";
import { sendMail } from "@/lib/mailer";

const submitSchema = z.object({
  title: z.string().trim().min(2).max(120),
  website: z.string().trim().url().max(500),
  githubRepo: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().min(20).max(4000),
  license: z.string().trim().max(120).optional().or(z.literal("")),
  contactEmail: z.string().trim().email(),
  submitterName: z.string().trim().max(80).optional().or(z.literal("")),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await dbConnect();
  const items = await GameSubmission.find().sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await req.json();
    const data = submitSchema.parse(body);

    await dbConnect();

    const submission = await GameSubmission.create({
      title: data.title,
      website: data.website,
      githubRepo: data.githubRepo || null,
      description: data.description,
      license: data.license || null,
      contactEmail: data.contactEmail.toLowerCase(),
      submitterName: data.submitterName || session?.user?.username || null,
      submittedBy: session?.user?.id || null,
      status: "pending",
    });

    const founder = "ryanschumacher@themediashop.co";
    if (isFounderAdminEmail(founder)) {
      try {
        await sendMail(
          founder,
          `New game submission: ${data.title}`,
          `<p><strong>${data.title}</strong> was submitted for PlayBound.</p>
           <p><a href="${data.website}">${data.website}</a></p>
           <p>${data.description.slice(0, 500)}</p>
           <p>Review in Admin → Submissions.</p>`
        );
      } catch (err) {
        console.error("Failed to notify founder of submission:", err);
      }
    }

    return NextResponse.json({ success: true, id: submission._id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Game submission error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
