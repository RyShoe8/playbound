import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import DeveloperClaim from "@/lib/models/DeveloperClaim";
import CatalogGame from "@/lib/models/CatalogGame";
import Developer from "@/lib/models/Developer";
import User from "@/lib/models/User";
import { firstZodErrorMessage } from "@/lib/zodError";

const decideSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  adminNotes: z.string().trim().max(2000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;

  try {
    const raw = await req.json();
    const data = decideSchema.parse(raw);

    await dbConnect();
    const claim = await DeveloperClaim.findById(id);
    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    claim.status = data.status;
    claim.adminNotes = data.adminNotes || null;
    claim.decidedAt = new Date();
    await claim.save();

    if (data.status === "approved") {
      // 1. Assign ownership
      if (claim.claimType === "game" && claim.gameSlug) {
        await CatalogGame.updateOne(
          { slug: claim.gameSlug },
          { $set: { ownerUserId: claim.userId, managedBy: "developer" } }
        );
      } else if (claim.claimType === "developer" && claim.developerSlug) {
        await Developer.updateOne(
          { slug: claim.developerSlug },
          { $set: { ownerUserId: claim.userId, claimedAt: new Date() } }
        );
      }

      // 2. Promote user role if regular user
      await User.updateOne(
        { _id: claim.userId, role: "user" },
        { $set: { role: "developer" } }
      );
    }

    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 422 });
    }
    console.error(`[api/admin/developer-claims/${id}] PATCH error:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
