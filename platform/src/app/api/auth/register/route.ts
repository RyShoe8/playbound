import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { sendMail, verificationEmailHtml } from "@/lib/mailer";

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(8),
});

function baseUrl(req: Request) {
  return process.env.NEXTAUTH_URL || new URL(req.url).origin;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, email, password } = registerSchema.parse(body);

    await dbConnect();

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return NextResponse.json({ error: "An account with this email or username already exists" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role: "user",
      emailVerified: false,
      verificationTokenHash: tokenHash,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const verifyUrl = `${baseUrl(req)}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

    let emailSent = true;
    let emailError: string | undefined;
    try {
      await sendMail(email, "Verify your PlayBound account", verificationEmailHtml(username, verifyUrl));
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
