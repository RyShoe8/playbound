import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { passwordResetEmailHtml, sendMail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/site";

const bodySchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

const GENERIC_OK = {
  success: true as const,
  message: "If an account exists for that email, we sent a reset link.",
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = bodySchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();

    await dbConnect();
    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    // Don't leak whether the email exists or whether it's Google-only.
    if (user?.password) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      user.passwordResetTokenHash = tokenHash;
      user.passwordResetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save();

      const resetUrl = absoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`);
      try {
        await sendMail(
          normalizedEmail,
          "Reset your PlayBound password",
          passwordResetEmailHtml(resetUrl)
        );
      } catch (mailErr) {
        console.error("Failed to send password reset email:", mailErr);
      }
    }

    return NextResponse.json(GENERIC_OK);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
