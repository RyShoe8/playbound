import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  createModClassification,
  getModClassificationTree,
} from "@/lib/modClassifications";

const createClassificationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
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
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const data = await getModClassificationTree(true);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Admin list classifications error:", err);
    return NextResponse.json({ error: "Failed to fetch classifications" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const json = await req.json();
    const parsed = createClassificationSchema.parse(json);
    const created = await createModClassification(parsed);
    return NextResponse.json({ success: true, classification: created }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || "Invalid payload" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to create classification";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
