import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ feed: string }> }
) {
  try {
    const { feed } = await params;
    if (feed === "latest.yml") {
      await dbConnect();
      const artifact = await Artifact.findOne({
        artifactType: "launcher",
        $or: [
          { artifactId: /^playbound-launcher-windows-/ },
          { filename: /^PlayBound-Setup-.*\.exe$/i },
        ],
      }).sort({ createdAt: -1 });

      if (artifact) {
        const sha512 =
          artifact.sha512 ||
          (artifact.version === "0.3.56"
            ? "DvRqyStiNxOSc1HZrirsZ5q8cQJgIHjcvaMD3bsf3RUP9+sPjp/Fxno4d/BTOtJeArIeW6RUW0bR2d7mFyk3mw=="
            : "");

        const yml = `version: ${artifact.version}
files:
  - url: https://playbound.club/api/launcher/download
    sha512: ${sha512}
    size: ${artifact.sizeBytes}
path: ${artifact.filename}
sha512: ${sha512}
releaseDate: '${artifact.createdAt ? artifact.createdAt.toISOString() : new Date().toISOString()}'
`;
        return new NextResponse(yml, {
          status: 200,
          headers: {
            "Content-Type": "text/yaml; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }
    }

    return NextResponse.redirect(
      `https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/${encodeURIComponent(feed)}`,
      307
    );
  } catch (err) {
    console.error("[launcher/updates error]:", err);
    return new NextResponse("Not Found", { status: 404 });
  }
}
