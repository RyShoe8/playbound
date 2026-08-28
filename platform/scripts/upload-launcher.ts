/**
 * Upload PlayBound Setup + electron-updater metadata to Vercel Blob.
 *
 * Usage (from platform/):
 *   npx vercel env pull .env.local --environment=production
 *   cd ../launcher && npm run dist
 *   npm run upload:launcher -- ../launcher/dist/PlayBound-Setup-0.1.5.exe
 *   npm run upload:launcher -- --prod ../launcher/dist/PlayBound-Setup-0.1.5.exe
 *   npm run upload:launcher -- --mac --prod
 *   npm run upload:launcher -- --linux --prod
 *
 * The channel defaults to admin. --prod publishes to the public installer and
 * auto-update feed, and on Windows refuses unless the build looks signed.
 *
 * Uploads:
 *   - versioned installer (as named in the update yml)
 *   - latest*.yml / admin*.yml + .blockmap (for in-app auto-update)
 *   - stable site alias (PlayBound-Launcher-Setup[.exe|.dmg|.AppImage])
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { basename, dirname, resolve } from "path";
import { loadEnvConfig } from "@next/env";
import { put } from "@vercel/blob";
import { resolveReleaseChannel } from "../src/lib/launcherReleaseChannel";

loadEnvConfig(process.cwd());

type PlatformKind = "windows" | "macos" | "linux";

const PLATFORM = {
  windows: {
    label: "Setup.exe",
    regex: /^PlayBound-Setup-\d+\.\d+\.\d+\.exe$/i,
    adminYml: "admin.yml",
    prodYml: "latest.yml",
    adminAlias: "PlayBound-Launcher-Setup-Admin.exe",
    prodAlias: "PlayBound-Launcher-Setup.exe",
    envVar: "NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL",
    buildHint: "cd launcher && npm run dist",
  },
  macos: {
    label: "DMG",
    regex: /^PlayBound-macOS-\d+\.\d+\.\d+\.dmg$/i,
    adminYml: "admin-mac.yml",
    prodYml: "latest-mac.yml",
    adminAlias: "PlayBound-Launcher-Setup-Admin.dmg",
    prodAlias: "PlayBound-Launcher-Setup.dmg",
    envVar: "NEXT_PUBLIC_LAUNCHER_MAC_DOWNLOAD_URL",
    buildHint: "cd launcher && npm run dist:mac",
  },
  linux: {
    label: "AppImage",
    regex: /^PlayBound-Linux-\d+\.\d+\.\d+\.AppImage$/i,
    adminYml: "admin-linux.yml",
    prodYml: "latest-linux.yml",
    adminAlias: "PlayBound-Launcher-Setup-Admin.AppImage",
    prodAlias: "PlayBound-Launcher-Setup.AppImage",
    envVar: "NEXT_PUBLIC_LAUNCHER_LINUX_DOWNLOAD_URL",
    buildHint: "cd launcher && npm run dist:linux",
  },
} as const;

async function uploadBlob(pathname: string, filePath: string, contentType: string) {
  const bytes = readFileSync(filePath);
  console.log(`  ${pathname} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
  const blob = await put(pathname, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    multipart: bytes.length > 4 * 1024 * 1024,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

function resolvePlatform(args: string[]): PlatformKind {
  if (args.includes("--mac") || args.includes("--macos")) return "macos";
  if (args.includes("--linux")) return "linux";
  return "windows";
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("BLOB_READ_WRITE_TOKEN is not set. Pull env with: npx vercel env pull");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const platform = resolvePlatform(args);
  const cfg = PLATFORM[platform];
  const argPath = args.find((a) => !a.startsWith("--"));
  const distDir = resolve(process.cwd(), "../launcher/dist");
  let setupPath = argPath ? resolve(argPath) : "";

  if (!setupPath || !existsSync(setupPath)) {
    const candidates = existsSync(distDir)
      ? readdirSync(distDir)
          .filter((f) => cfg.regex.test(f))
          .sort((a, b) => {
            const va = a.match(/(\d+)\.(\d+)\.(\d+)/);
            const vb = b.match(/(\d+)\.(\d+)\.(\d+)/);
            if (!va || !vb) return a.localeCompare(b);
            for (let i = 1; i <= 3; i++) {
              const d = Number(va[i]) - Number(vb[i]);
              if (d) return d;
            }
            return 0;
          })
      : [];
    if (candidates.length === 0) {
      console.error(`${cfg.label} not found. Build first: ${cfg.buildHint}`);
      process.exit(1);
    }
    setupPath = resolve(distDir, candidates[candidates.length - 1]);
  }

  const setupName = basename(setupPath);
  const dir = dirname(setupPath);

  /*
   * The yml files are evidence about how the build was made, not the choice of
   * where it goes. electron-builder writes admin.yml only for an unsigned build
   * and latest.yml only for a signed one.
   */
  const hasAdminYml = existsSync(resolve(dir, cfg.adminYml));
  const hasProdYml = existsSync(resolve(dir, cfg.prodYml));

  const decision = resolveReleaseChannel(args, { hasAdminYml, hasProdYml, platform });
  if (decision.refuse) {
    console.error("");
    console.error(decision.refuse);
    console.error("");
    process.exit(1);
  }
  const isAdmin = decision.channel === "admin";
  if (!decision.explicit) {
    console.log("No channel given — using the admin channel. Pass --prod to publish publicly.");
  }

  // Whichever metadata the build produced is what we publish, under the feed
  // name the target channel reads.
  const localYmlName = hasAdminYml ? cfg.adminYml : cfg.prodYml;
  const ymlName = isAdmin ? cfg.adminYml : cfg.prodYml;
  const ymlPath = resolve(dir, localYmlName);
  const blockmapPath = resolve(dir, `${setupName}.blockmap`);

  console.log(`Uploading ${platform} updater package from ${dir}…`);

  const setupUrl = await uploadBlob(
    `launcher/${setupName}`,
    setupPath,
    "application/octet-stream"
  );

  let ymlUrl: string | null = null;
  let adminYmlUrl: string | null = null;
  let prodYmlUrl: string | null = null;

  if (existsSync(ymlPath)) {
    // Always sync both admin feed (e.g. admin.yml) and prod feed (e.g. latest.yml)
    adminYmlUrl = await uploadBlob(`launcher/${cfg.adminYml}`, ymlPath, "text/yaml; charset=utf-8");
    prodYmlUrl = await uploadBlob(`launcher/${cfg.prodYml}`, ymlPath, "text/yaml; charset=utf-8");
    ymlUrl = isAdmin ? adminYmlUrl : prodYmlUrl;
  } else {
    console.warn(`  warning: ${ymlPath} missing — auto-update checks will fail until present`);
  }

  if (existsSync(blockmapPath)) {
    await uploadBlob(
      `launcher/${basename(blockmapPath)}`,
      blockmapPath,
      "application/octet-stream"
    );
  } else {
    console.warn("  warning: .blockmap missing — delta updates unavailable");
  }

  // Always refresh both admin alias and prod alias
  const aliasUrl = await uploadBlob(`launcher/${cfg.adminAlias}`, setupPath, "application/octet-stream");
  const prodAliasUrl = await uploadBlob(`launcher/${cfg.prodAlias}`, setupPath, "application/octet-stream");
  console.log(`  published to feeds & aliases → ${cfg.prodAlias}, ${cfg.adminAlias}, ${cfg.prodYml}, ${cfg.adminYml}`);

  const feedBase = (prodAliasUrl || aliasUrl).replace(/\/[^/]+$/, "/");

  await registerLauncherArtifact({
    platform,
    setupName,
    setupPath,
    // The immutable versioned object is the only safe archive source. An
    // alias changes on the next release while the VPS may still be fetching.
    downloadUrl: setupUrl,
    channel: isAdmin ? "admin" : "prod",
    archiveToVps: platform === "windows" && !isAdmin,
  });

  console.log("");
  console.log("Uploaded.");
  console.log(`  Versioned: ${setupUrl}`);
  console.log(`  Site alias: ${prodAliasUrl || aliasUrl}`);
  if (isAdmin) console.log(`  Admin alias: ${aliasUrl}`);
  if (ymlUrl) console.log(`  Update feed: ${ymlUrl}`);
  if (prodYmlUrl) console.log(`  Prod update feed: ${prodYmlUrl}`);
  console.log(`  electron-updater url: ${feedBase}`);
  console.log("");
  console.log("Set on Vercel (Production + Preview) if changed:");
  console.log(`  ${cfg.envVar}=${prodAliasUrl || aliasUrl}`);
}

/**
 * Register this build in the download-mirror tables.
 *
 * The launcher installer is the one artifact we host ourselves, and it was the
 * only download outside the mirror system entirely — so it had no size, health
 * or download history alongside everything else. Registering it here rather
 * than in a separate step means it happens on every release, using the exact
 * file and version that just went up.
 *
 * Failure is logged and swallowed: the build is already on the blob and
 * downloadable, and a bookkeeping miss must not fail the release.
 */
async function registerLauncherArtifact(input: {
  platform: PlatformKind;
  setupName: string;
  setupPath: string;
  downloadUrl: string;
  channel: "admin" | "prod";
  /** Only a signed Windows release is eligible for automatic VPS archival. */
  archiveToVps: boolean;
}) {
  try {
    const version = input.setupName.match(/(\d+\.\d+\.\d+)/)?.[1] || "unknown";
    const bytes = readFileSync(input.setupPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const artifactId = `playbound-launcher-${input.platform}-${version}`;

    const [{ default: dbConnect }, { ensureArtifact, ensurePublicSource }, mongoose] =
      await Promise.all([
        import("../src/lib/db"),
        import("../src/lib/mirrors/ensureArtifact"),
        import("mongoose"),
      ]);

    await dbConnect();

    const artifact = await ensureArtifact({
      artifactId,
      gameSlug: null,
      version,
      filename: input.setupName,
      sizeBytes: bytes.length,
      sha256,
      artifactType: "launcher",
    });

    if (artifact) {
      // Unlike a third-party download, this one we do host and may mirror.
      artifact.mirrorEnabled = true;
      artifact.redistributionAllowed = true;
      artifact.licenseStatus = "first_party";
      // Blob upload does not mean an authoritative VPS copy exists yet.
      // Unsigned/admin builds intentionally remain outside that archive flow.
      if (!input.archiveToVps) artifact.vpsStatus = "missing";
      await artifact.save();
    }

    await ensurePublicSource({
      artifactId,
      sourceId: `blob-${input.platform}-${input.channel}-${version}`,
      url: input.downloadUrl,
    });

    console.log(`  Registered artifact: ${artifactId} (${sha256.slice(0, 12)}…)`);
    if (input.archiveToVps && artifact) {
      const { archiveArtifactToVps } = await import("../src/lib/mirrors/cacheManager");
      const { archivedArtifactStatusOnHost, deleteArchivedArtifactOnHost } = await import("../src/lib/gameHost/client");
      const { default: Artifact } = await import("../src/lib/models/Artifact");
      const archived = await archiveArtifactToVps(artifactId, "signed-launcher-release", input.downloadUrl);
      if (!archived.success) {
        console.warn(`  Could not archive signed launcher to VPS: ${archived.message}`);
      } else {
        console.log(`  VPS archive: ${archived.message}`);
        const ready = await waitForVpsArchive(artifact.relativePath, archivedArtifactStatusOnHost);
        if (!ready) {
          console.warn("  New signed launcher is still copying to the VPS; older launcher archives were left in place.");
        } else {
          const removed = await removeOlderWindowsLauncherArchives({
            Artifact,
            currentArtifactId: artifactId,
            currentVersion: version,
            deleteArchivedArtifactOnHost,
          });
          if (removed > 0) console.log(`  Removed ${removed} superseded signed Windows launcher archive(s) from the VPS.`);
        }
      }
    }
    await mongoose.default.disconnect();
  } catch (err) {
    console.warn(
      `  Could not register the mirror artifact (upload itself succeeded): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/** Wait for the new signed installer before removing any predecessor. */
async function waitForVpsArchive(
  relativePath: string,
  status: (path: string) => Promise<{ status: "missing" | "uploading" | "verified"; message?: string } | null>
) {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const result = await status(relativePath);
    if (result?.status === "verified") return true;
    if (result?.status === "missing") return false;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return false;
}

function compareVersions(a: string, b: string) {
  const left = a.split(".").map((part) => Number(part));
  const right = b.split(".").map((part) => Number(part));
  for (let i = 0; i < 3; i += 1) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return difference;
  }
  return 0;
}

/**
 * Retain the artifact records and any R2 cache history, but remove only old
 * signed Windows installer files from the authoritative VPS disk. This is
 * deliberately constrained to the launcher artifact-id namespace.
 */
async function removeOlderWindowsLauncherArchives(input: {
  Artifact: typeof import("../src/lib/models/Artifact").default;
  currentArtifactId: string;
  currentVersion: string;
  deleteArchivedArtifactOnHost: (relativePath: string) => Promise<{ success: boolean; message?: string }>;
}) {
  const oldArtifacts = await input.Artifact.find({
    artifactType: "launcher",
    artifactId: /^playbound-launcher-windows-\d+\.\d+\.\d+$/,
    vpsStatus: "verified",
  }).select("artifactId version relativePath vpsStatus vpsStatusMessage");

  let removed = 0;
  for (const oldArtifact of oldArtifacts) {
    if (String(oldArtifact.artifactId) === input.currentArtifactId) continue;
    if (compareVersions(String(oldArtifact.version), input.currentVersion) >= 0) continue;
    const result = await input.deleteArchivedArtifactOnHost(String(oldArtifact.relativePath));
    if (!result.success) {
      console.warn(`  Could not remove old VPS launcher ${oldArtifact.filename || oldArtifact.artifactId}: ${result.message || "unknown error"}`);
      continue;
    }
    oldArtifact.vpsStatus = "missing";
    oldArtifact.vpsStatusMessage = `Superseded by signed launcher ${input.currentVersion}.`;
    await oldArtifact.save();
    removed += 1;
  }
  return removed;
}

main().catch((err) => {
  console.error("upload:launcher failed:", err);
  process.exit(1);
});
