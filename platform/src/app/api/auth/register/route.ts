import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { isFounderAdminEmail } from "@/lib/admin";
import { newsletterListId, upsertBrevoContact } from "@/lib/brevo";
import dbConnect from "@/lib/db";
import NewsletterSubscriber from "@/lib/models/NewsletterSubscriber";
import User from "@/lib/models/User";
import { sendMail, verificationEmailHtml } from "@/lib/mailer";
import { clientIpFrom, recaptchaErrorMessage, verifyRecaptcha } from "@/lib/recaptcha";

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(8),
  newsletterOptIn: z.boolean().optional().default(false),
  recaptchaToken: z.string().optional(),
});

function baseUrl(req: Request) {
  return process.env.NEXTAUTH_URL || new URL(req.url).origin;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, email, password, newsletterOptIn, recaptchaToken } =
      registerSchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();

    // Bot check before any write, and before we spend a Brevo call or an email.
    const captcha = await verifyRecaptcha(recaptchaToken, "signup", {
      remoteIp: clientIpFrom(req),
    });
    if (!captcha.ok) {
      console.warn(
        `[register] reCAPTCHA rejected: ${captcha.reason}${captcha.score !== null ? ` (score ${captcha.score})` : ""}`
      );
      return NextResponse.json(
        { error: recaptchaErrorMessage(captcha.reason) },
        { status: 400 }
      );
    }

    await dbConnect();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username }],
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email or username already exists" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.create({
      username,
      email: normalizedEmail,
      password: hashedPassword,
      role: isFounderAdminEmail(normalizedEmail) ? "admin" : "user",
      emailVerified: false,
      verificationTokenHash: tokenHash,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const listId = newsletterListId();
    const brevoOpts = {
      email: normalizedEmail,
      attributes: { USERNAME: username },
      ...(newsletterOptIn ? { listIds: [listId] } : {}),
    };
    await upsertBrevoContact(brevoOpts);

    if (newsletterOptIn) {
      try {
        const existingSub = await NewsletterSubscriber.findOne({ email: normalizedEmail });
        if (existingSub) {
          existingSub.subscribed = true;
          existingSub.listId = listId;
          existingSub.userId = user._id;
          await existingSub.save();
        } else {
          await NewsletterSubscriber.create({
            email: normalizedEmail,
            subscribed: true,
            listId,
            userId: user._id,
          });
        }
      } catch (subErr) {
        console.error("Newsletter subscribe on register failed:", subErr);
      }
    }

    const verifyUrl = `${baseUrl(req)}/verify-email?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    let emailSent = true;
    let emailError: string | undefined;
    try {
      await sendMail(
        normalizedEmail,
        "Verify your PlayBound account",
        verificationEmailHtml(username, verifyUrl)
      );
    } catch (mailErr) {
      emailSent = false;
      emailError = mailErr instanceof Error ? mailErr.message : String(mailErr);
      console.error("Failed to send verification email:", mailErr);
    }

    return NextResponse.json(
      { success: true, userId: user._id, emailSent, ...(emailError ? { emailError } : {}) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
