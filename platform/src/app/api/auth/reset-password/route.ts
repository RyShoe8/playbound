import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

const bodySchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, password } = bodySchema.parse(body);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await dbConnect();
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
    }).select("+password +passwordResetTokenHash +passwordResetTokenExpires");

    if (!user?.passwordResetTokenHash || user.passwordResetTokenHash !== tokenHash) {
      return NextResponse.json({ error: "This reset link is invalid." }, { status: 400 });
    }
    if (!user.passwordResetTokenExpires || user.passwordResetTokenExpires.getTime() < Date.now()) {
      return NextResponse.json({ error: "This reset link has expired." }, { status: 400 });
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetTokenHash = undefined;
    user.passwordResetTokenExpires = undefined;
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
