import { NextResponse } from "next/server";
import { getMod, toInstallMeta } from "@/lib/mods";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const mod = await getMod(slug);
  if (!mod) {
    return NextResponse.json({ error: "Mod not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      mod,
      install: toInstallMeta(mod),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
