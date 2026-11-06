import { NextResponse } from "next/server";
import { getMod, toInstallMeta } from "@/lib/mods";
import { requestIncludesTesting } from "@/lib/requestIncludesTesting";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  // A viewer who can list a testing mod has to be able to install it too.
  const includeTesting = await requestIncludesTesting(req);
  const mod = await getMod(slug, { includeTesting });
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
        "Cache-Control": includeTesting
          ? "private, no-store"
          : "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
