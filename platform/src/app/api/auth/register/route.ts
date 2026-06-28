import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, email, password } = registerSchema.parse(body);

    await dbConnect();

    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      return new Response(JSON.stringify({ error: "User already exists with this email or username" }), { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      isGuest: false,
    });

    return new Response(JSON.stringify({ success: true, userId: user._id }), { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: error.issues[0].message }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
