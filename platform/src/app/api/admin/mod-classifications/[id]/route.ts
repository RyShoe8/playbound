import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  deleteModClassification,
  getModClassification,
  updateModClassification,
} from "@/lib/modClassifications";

const updateClassificationSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(100).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case")
    .optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  parentId: z.string().trim().optional().nullable(),
  icon: z.string().trim().max(50).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const doc = await getModClassification(id);
    if (!doc) {
      return NextResponse.json({ error: "Classification not found" }, { status: 404 });
    }
    return NextResponse.json({ classification: doc });
  } catch (err) {
    console.error("Admin get classification error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const json = await req.json();
    const parsed = updateClassificationSchema.parse(json);
    const updated = await updateModClassification(id, parsed);
    return NextResponse.json({ success: true, classification: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || "Invalid payload" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to update classification";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { id } = await params;
    const res = await deleteModClassification(id);
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete classification";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
