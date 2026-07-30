import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import NewsletterSubscriber from "@/lib/models/NewsletterSubscriber";
import { newsletterListId, upsertBrevoContact } from "@/lib/brevo";
import { clientIpFrom, recaptchaErrorMessage, verifyRecaptcha } from "@/lib/recaptcha";

const subscribeSchema = z.object({
  email: z.string().email(),
  recaptchaToken: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, recaptchaToken } = subscribeSchema.parse(body);
    const normalized = email.trim().toLowerCase();
    const listId = newsletterListId();

    // Checked before the Brevo call — a spam subscribe costs an API quota unit
    // and pollutes the list even if it never becomes an account.
    const captcha = await verifyRecaptcha(recaptchaToken, "newsletter", {
      remoteIp: clientIpFrom(req),
    });
    if (!captcha.ok) {
      console.warn(`[newsletter] reCAPTCHA rejected: ${captcha.reason}`);
      return NextResponse.json(
        { error: recaptchaErrorMessage(captcha.reason) },
        { status: 400 }
      );
    }

    await dbConnect();

    const existing = await NewsletterSubscriber.findOne({ email: normalized });
    if (existing) {
      return NextResponse.json({ error: "Email already subscribed" }, { status: 400 });
    }

    await NewsletterSubscriber.create({
      email: normalized,
      subscribed: true,
      listId,
    });

    await upsertBrevoContact({
      email: normalized,
      listIds: [listId],
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    console.error("Newsletter subscribe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
