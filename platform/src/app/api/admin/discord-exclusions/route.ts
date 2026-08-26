import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from "fs";
import path from "path";

const EXCLUSIONS_FILE = path.join(process.cwd(), "discord-exclusions.json");

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    if (fs.existsSync(EXCLUSIONS_FILE)) {
      const data = fs.readFileSync(EXCLUSIONS_FILE, "utf-8");
      return NextResponse.json(JSON.parse(data));
    }
    return NextResponse.json([]);
  } catch (error) {
    console.error("Failed to read discord exclusions", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { action, slug } = await req.json();
    if (!slug || typeof slug !== "string") {
      return new NextResponse("Invalid slug", { status: 400 });
    }

    let exclusions: string[] = [];
    if (fs.existsSync(EXCLUSIONS_FILE)) {
      exclusions = JSON.parse(fs.readFileSync(EXCLUSIONS_FILE, "utf-8"));
    }

    if (action === "add" && !exclusions.includes(slug)) {
      exclusions.push(slug);
    } else if (action === "remove") {
      exclusions = exclusions.filter((s) => s !== slug);
    } else {
      return new NextResponse("Invalid action", { status: 400 });
    }

    fs.writeFileSync(EXCLUSIONS_FILE, JSON.stringify(exclusions, null, 2), "utf-8");
    return NextResponse.json(exclusions);
  } catch (error) {
    console.error("Failed to update discord exclusions", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
