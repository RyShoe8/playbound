import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import {
  buildSignedWindowsLatestYml,
  parseWindowsSetupFilename,
} from "@/lib/launcherUpdateFeed";
import { pickLatestLauncherArtifact } from "@/lib/mirrors/semver";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ feed: string }> }
) {
  try {
    const { feed } = await params;
    if (feed === "latest.yml") {
      await dbConnect();
      const artifacts = await Artifact.find({
        artifactType: "launcher",
        $or: [
          { artifactId: /^playbound-launcher-windows-/ },
          { filename: /^PlayBound-Setup-.*\.exe$/i },
        ],
      }).lean();
      const artifact = pickLatestLauncherArtifact(artifacts);

      if (artifact?.filename && parseWindowsSetupFilename(artifact.filename) && artifact.sha512) {
        const yml = buildSignedWindowsLatestYml({
          version: String(artifact.version),
          fileName: artifact.filename,
          sizeBytes: Number(artifact.sizeBytes) || 0,
          sha512: String(artifact.sha512),
          releaseDate: (artifact as { createdAt?: Date }).createdAt || new Date(),
        });
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
