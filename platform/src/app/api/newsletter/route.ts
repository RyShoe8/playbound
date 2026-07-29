import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import NewsletterSubscriber from "@/lib/models/NewsletterSubscriber";
import { newsletterListId, upsertBrevoContact } from "@/lib/brevo";

const subscribeSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = subscribeSchema.parse(body);
    const normalized = email.trim().toLowerCase();
    const listId = newsletterListId();

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
