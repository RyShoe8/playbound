import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession, requireAdminViewSession } from "@/lib/requireAdmin";
import { canWriteAdmin } from "@/lib/adminAccess";
import { installationUpdatesOnHost } from "@/lib/gameHost/client";
import { INSTALLATION_UPDATE_KEYS } from "@/lib/gameHost/installationKeys";
import { withInstallationCoverage } from "@/lib/gameHost/installationCoverage";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), key: z.enum(INSTALLATION_UPDATE_KEYS) }).strict(),
  z.object({ action: z.literal("rollback"), key: z.enum(INSTALLATION_UPDATE_KEYS) }).strict(),
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }).strict(),
]);

export async function GET() {
  const { session, error } = await requireAdminViewSession();
  if (error) return error;
  try {
    return NextResponse.json({ ...withInstallationCoverage(await installationUpdatesOnHost()), canWrite: canWriteAdmin(session?.user?.role) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not reach the installation update queue" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid installation action" }, { status: 400 });
  try {
    const data = await installationUpdatesOnHost({ ...input.data, actor: session!.user.id });
    return NextResponse.json({ ...withInstallationCoverage(data), canWrite: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not queue update" }, { status: 409 });
  }
}
