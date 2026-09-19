import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import DeveloperClaim from "@/lib/models/DeveloperClaim";
import CatalogGame from "@/lib/models/CatalogGame";
import Developer from "@/lib/models/Developer";
import { isFounderAdminEmail } from "@/lib/admin";
import { sendMail } from "@/lib/mailer";
import { firstZodErrorMessage } from "@/lib/zodError";

const claimSchema = z.object({
  claimType: z.enum(["game", "developer"]),
  gameSlug: z.string().trim().optional().nullable(),
  developerSlug: z.string().trim().optional().nullable(),
  contactEmail: z.string().trim().email(),
  verificationUrl: z.string().trim().url(),
  message: z.string().trim().max(2000).optional().default(""),
}).refine(
  (data) => (data.claimType === "game" ? Boolean(data.gameSlug) : Boolean(data.developerSlug)),
  {
    message: "A target game or developer slug is required",
    path: ["claimType"],
  }
);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required to submit a claim" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const data = claimSchema.parse(raw);

    await dbConnect();

    // Verify the target actually exists
    if (data.claimType === "game" && data.gameSlug) {
      const exists = await CatalogGame.findOne({ slug: data.gameSlug }).select("_id title").lean();
      if (!exists) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
    } else if (data.claimType === "developer" && data.developerSlug) {
      const exists = await Developer.findOne({ slug: data.developerSlug }).select("_id name").lean();
      if (!exists) {
        return NextResponse.json({ error: "Developer profile not found" }, { status: 404 });
      }
    }

    const claim = await DeveloperClaim.create({
      userId: session.user.id,
      claimType: data.claimType,
      gameSlug: data.gameSlug || null,
      developerSlug: data.developerSlug || null,
      contactEmail: data.contactEmail.toLowerCase(),
      verificationUrl: data.verificationUrl,
      message: data.message,
      status: "pending",
    });

    const targetLabel = data.claimType === "game" ? `game: ${data.gameSlug}` : `studio: ${data.developerSlug}`;
    const founder = "ryanschumacher@themediashop.co";
    if (isFounderAdminEmail(founder)) {
      try {
        await sendMail(
          founder,
          `New ownership claim for ${targetLabel}`,
          `<p>User <strong>${session.user.username || session.user.id}</strong> requested ownership for ${targetLabel}.</p>
           <p>Contact: <a href="mailto:${data.contactEmail}">${data.contactEmail}</a></p>
           <p>Verification link: <a href="${data.verificationUrl}">${data.verificationUrl}</a></p>
           <p>Message: ${data.message}</p>
           <p>Review in Admin → Developer Claims.</p>`
        );
      } catch (err) {
        console.error("Failed to notify founder of developer claim:", err);
      }
    }

    return NextResponse.json({ success: true, id: claim._id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 422 });
    }
    console.error("[api/developer/claim] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
