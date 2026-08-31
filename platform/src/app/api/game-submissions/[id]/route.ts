import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import GameSubmission from "@/lib/models/GameSubmission";

const patchSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  adminNotes: z.string().trim().max(2000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    await dbConnect();
    const item = await GameSubmission.findByIdAndUpdate(
      id,
      {
        status: body.status,
        adminNotes: body.adminNotes || null,
        decidedAt: new Date(),
      },
      { returnDocument: "after" }
    );

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, item });
  } catch (error) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Submission patch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
