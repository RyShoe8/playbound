import { NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

export async function POST(req: Request) {
  try {
    const { token, email } = await req.json();
    if (!token || !email) {
      return NextResponse.json({ error: "Missing token or email" }, { status: 400 });
    }

    await dbConnect();

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ email: String(email).toLowerCase() }).select(
      "+verificationTokenHash +verificationTokenExpires"
    );

    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (user.emailVerified) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }
    if (!user.verificationTokenHash || user.verificationTokenHash !== tokenHash) {
      return NextResponse.json({ error: "Invalid or expired verification link" }, { status: 400 });
    }
    if (!user.verificationTokenExpires || user.verificationTokenExpires.getTime() < Date.now()) {
      return NextResponse.json({ error: "This verification link has expired. Please sign up again." }, { status: 400 });
    }

    user.emailVerified = true;
    user.verificationTokenHash = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
