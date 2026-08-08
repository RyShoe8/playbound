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
import { checkRateLimit } from "@/lib/discussion/rateLimit";
import { absoluteUrl } from "@/lib/site";

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(8),
  newsletterOptIn: z.boolean().optional().default(false),
  recaptchaToken: z.string().optional(),
});

/**
 * Verification links must be absolute — an email has no page to be relative
 * to — so they use the canonical site origin rather than the request's.
 *
 * This previously read `NEXTAUTH_URL || new URL(req.url).origin`. On Vercel
 * both resolve to a per-deployment host, so every link stopped working the
 * moment that deployment was superseded: clicking one returned
 * DEPLOYMENT_NOT_FOUND. Emails outlive deployments, so the link has to point
 * at the stable public origin. src/lib/site.ts exists for exactly this and
 * warns against deriving from NEXTAUTH_URL or VERCEL_URL.
 */
function verificationLink(token: string, email: string) {
  return absoluteUrl(
    `/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, email, password, newsletterOptIn, recaptchaToken } =
      registerSchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();
    const ip = clientIpFrom(req) || "unknown";

    await dbConnect();

    const ipLimit = await checkRateLimit(`register:ip:${ip}`, {
      max: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many signup attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSec) },
        }
      );
    }

    const emailLimit = await checkRateLimit(`register:email:${normalizedEmail}`, {
      max: 3,
      windowMs: 60 * 60 * 1000,
    });
    if (!emailLimit.ok) {
      return NextResponse.json(
        { error: "Too many signup attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(emailLimit.retryAfterSec) },
        }
      );
    }

    // Bot check before any write, and before we spend a Brevo call or an email.
    const captcha = await verifyRecaptcha(recaptchaToken, "signup", {
      remoteIp: ip === "unknown" ? null : ip,
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

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username }],
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "Unable to create that account. Try a different email or username." },
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

    const verifyUrl = verificationLink(token, normalizedEmail);

    let emailSent = true;
    try {
      await sendMail(
        normalizedEmail,
        "Verify your PlayBound account",
        verificationEmailHtml(username, verifyUrl)
      );
    } catch (mailErr) {
      emailSent = false;
      console.error("Failed to send verification email:", mailErr);
    }

    return NextResponse.json(
      { success: true, userId: user._id, emailSent },
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
