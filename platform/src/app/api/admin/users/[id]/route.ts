import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { isFounderAdminEmail } from "@/lib/admin";
import { requireAdminSession } from "@/lib/requireAdmin";

const patchSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  disabled: z.boolean().optional(),
  suspendedUntil: z.union([z.string().min(1), z.null()]).optional(),
  warnings: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) return error!;

    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    if (body.role === undefined && body.disabled === undefined && body.suspendedUntil === undefined && body.warnings === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await dbConnect();
    const user = await User.findById(id);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (isFounderAdminEmail(user.email)) {
      if (body.role === "user") {
        return NextResponse.json({ error: "Cannot demote the founder admin" }, { status: 403 });
      }
      if (body.disabled === true) {
        return NextResponse.json({ error: "Cannot disable the founder admin" }, { status: 403 });
      }
    }

    if (session.user.id === id) {
      if (body.role === "user") {
        return NextResponse.json({ error: "Cannot demote yourself" }, { status: 403 });
      }
      if (body.disabled === true) {
        return NextResponse.json({ error: "Cannot disable yourself" }, { status: 403 });
      }
    }

    if (body.role !== undefined) user.role = body.role;
    if (body.disabled !== undefined) user.disabled = body.disabled;
    if (body.suspendedUntil !== undefined) {
      user.community = user.community ?? {};
      user.community.suspendedUntil =
        body.suspendedUntil === null ? null : new Date(body.suspendedUntil);
    }
    if (body.warnings !== undefined) {
      user.community = user.community ?? {};
      user.community.warnings = body.warnings;
    }
    await user.save();

    return NextResponse.json({
      success: true,
      user: {
        id: String(user._id),
        role: user.role,
        disabled: Boolean(user.disabled),
        suspendedUntil: user.community?.suspendedUntil ?? null,
        warnings: user.community?.warnings ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("Admin user patch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAdminSession();
    if (error || !session) return error!;

    const { id } = await params;
    if (session.user.id === id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 403 });
    }

    await dbConnect();
    const user = await User.findById(id);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (isFounderAdminEmail(user.email)) {
      return NextResponse.json({ error: "Cannot delete the founder admin" }, { status: 403 });
    }

    await User.findByIdAndDelete(id);
    // UGC (reviews/guides/posts) keeps username snapshot; orphaned user refs remain as deleted user content.
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin user delete error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
