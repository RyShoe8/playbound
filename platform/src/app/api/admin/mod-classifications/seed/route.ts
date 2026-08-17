import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { seedDefaultModClassifications } from "@/lib/modClassifications";

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";
    const result = await seedDefaultModClassifications(force);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Admin seed classifications error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to seed classifications" },
      { status: 500 }
    );
  }
}
