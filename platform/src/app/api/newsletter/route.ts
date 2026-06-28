import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import NewsletterSubscriber from "@/lib/models/NewsletterSubscriber";
import { z } from "zod";

// Basic Brevo API setup (mocked if API key missing)
const BREVO_API_KEY = process.env.BREVO_API_KEY;

const subscribeSchema = z.object({
  email: z.string().email()
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = subscribeSchema.parse(body);

    await dbConnect();

    const existing = await NewsletterSubscriber.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: "Email already subscribed" }, { status: 400 });
    }

    // Save to Mongo
    await NewsletterSubscriber.create({ email });

    // Optional: Send to Brevo API
    if (BREVO_API_KEY) {
      try {
        await fetch('https://api.brevo.com/v3/contacts', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ email, listIds: [1] }) // Assume list ID 1 for MVP
        });
      } catch (e) {
        console.error("Brevo API error:", e);
      }
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
