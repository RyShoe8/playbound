import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Gear from "@/lib/models/Gear";

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;

  try {
    const data = await req.json();
    await dbConnect();
    
    // Prevent slug changes from breaking references unless we handle it properly.
    // For V1, we'll allow it, or assume slug is mostly static. 
    // In Mongoose, findOneAndUpdate is easy.
    const gear = await Gear.findOneAndUpdate({ slug }, data, { new: true });
    
    if (!gear) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    
    return NextResponse.json(gear);
  } catch (error: any) {
    console.error("Update gear failed:", error);
    if (error.code === 11000) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;

  try {
    await dbConnect();
    const gear = await Gear.findOneAndDelete({ slug });
    if (!gear) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete gear failed:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
