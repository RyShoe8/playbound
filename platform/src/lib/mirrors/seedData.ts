import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import { getMirrorSettings } from "./cacheManager";

export const INITIAL_ARTIFACTS = [
  {
    artifactId: "holocure-0.7.1",
    gameSlug: "holocure",
    version: "0.7.1",
    artifactType: "game",
    filename: "HoloCure.zip",
    relativePath: "games/holocure/0.7.1/HoloCure.zip",
    sizeBytes: 183421932, // ~175 MB
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    licenseStatus: "freeware",
    mirrorEnabled: true,
    redistributionAllowed: true,
    vpsStatus: "verified",
    r2Status: "cached",
    r2PromotionScore: 91,
    r2LastPromoted: new Date(Date.now() - 4 * 3600000),
    r2Protected: false,
    r2Disabled: false,
    totalDownloads: 842,
    recentDownloads: 48,
    averageDownloadSpeed: 12500000, // 12.5 MB/s
    publicSuccessCount: 320,
    publicFailureCount: 145,
    sources: [
      {
        sourceId: "src-holocure-itch-1",
        sourceType: "public",
        url: "https://kay-yu.itch.io/holocure/download",
        enabled: true,
        priority: 70,
        healthStatus: "degraded",
        successCount: 210,
        failureCount: 88,
        timeoutCount: 14,
        checksumFailureCount: 0,
        averageDownloadSpeed: 2100000,
      },
      {
        sourceId: "src-holocure-github-mirror",
        sourceType: "public",
        url: "https://github.com/Kay-Yu/HoloCure/releases/download/v0.7.1/HoloCure.zip",
        enabled: true,
        priority: 100,
        healthStatus: "healthy",
        successCount: 110,
        failureCount: 5,
        timeoutCount: 1,
        checksumFailureCount: 0,
        averageDownloadSpeed: 6400000,
      },
    ],
  },
  {
    artifactId: "openra-2026.03",
    gameSlug: "openra",
    version: "2026.03",
    artifactType: "game",
    filename: "OpenRA-release-20260301-x86_64.AppImage",
    relativePath: "games/openra/2026.03/OpenRA-release-20260301-x86_64.AppImage",
    sizeBytes: 89456120, // ~85 MB
    sha256: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    licenseStatus: "open_source",
    mirrorEnabled: true,
    redistributionAllowed: true,
    vpsStatus: "verified",
    r2Status: "not_cached",
    r2PromotionScore: 24,
    r2Protected: false,
    r2Disabled: false,
    totalDownloads: 412,
    recentDownloads: 12,
    averageDownloadSpeed: 18000000,
    publicSuccessCount: 405,
    publicFailureCount: 7,
    sources: [
      {
        sourceId: "src-openra-github-official",
        sourceType: "public",
        url: "https://github.com/OpenRA/OpenRA/releases/download/release-20260301/OpenRA-release-20260301-x86_64.AppImage",
        enabled: true,
        priority: 100,
        healthStatus: "healthy",
        successCount: 405,
        failureCount: 7,
        timeoutCount: 0,
        checksumFailureCount: 0,
        averageDownloadSpeed: 18000000,
      },
    ],
  },
  {
    artifactId: "warzone2100-4.5.1",
    gameSlug: "warzone-2100",
    version: "4.5.1",
    artifactType: "game",
    filename: "warzone2100_portable.zip",
    relativePath: "games/warzone-2100/4.5.1/warzone2100_portable.zip",
    sizeBytes: 254128900, // ~242 MB
    sha256: "7d1a54127b222502f5b79b5fb0803061152a44f92b37e23c65dd0e334d217ac6",
    licenseStatus: "open_source",
    mirrorEnabled: true,
    redistributionAllowed: true,
    vpsStatus: "verified",
    r2Status: "cached",
    r2PromotionScore: 84,
    r2LastPromoted: new Date(Date.now() - 12 * 3600000),
    r2Protected: true,
    r2Disabled: false,
    totalDownloads: 620,
    recentDownloads: 34,
    averageDownloadSpeed: 9500000,
    publicSuccessCount: 480,
    publicFailureCount: 82,
    sources: [
      {
        sourceId: "src-wz2100-sourceforge-cdn",
        sourceType: "public",
        url: "https://downloads.sourceforge.net/project/warzone2100/releases/4.5.1/warzone2100_portable.zip",
        enabled: true,
        priority: 70,
        healthStatus: "degraded",
        successCount: 480,
        failureCount: 82,
        timeoutCount: 19,
        checksumFailureCount: 1,
        averageDownloadSpeed: 1400000,
      },
    ],
  },
  {
    artifactId: "flightgear-2020.3.18",
    gameSlug: "flightgear",
    version: "2020.3.18",
    artifactType: "game",
    filename: "FlightGear-2020.3.18.exe",
    relativePath: "games/flightgear/2020.3.18/FlightGear-2020.3.18.exe",
    sizeBytes: 1948500000, // ~1.81 GB
    sha256: "c51a02797e85c1815b3c5861112ea024f2b186b62fa5d2077e6f66348842f61e",
    licenseStatus: "open_source",
    mirrorEnabled: true,
    redistributionAllowed: true,
    vpsStatus: "verified",
    r2Status: "not_cached",
    r2PromotionScore: 32,
    r2Protected: false,
    r2Disabled: false,
    totalDownloads: 190,
    recentDownloads: 8,
    averageDownloadSpeed: 8200000,
    publicSuccessCount: 182,
    publicFailureCount: 8,
    sources: [
      {
        sourceId: "src-flightgear-sf-mirror",
        sourceType: "public",
        url: "https://download.flightgear.org/builds/2020.3/FlightGear-2020.3.18.exe",
        enabled: true,
        priority: 100,
        healthStatus: "healthy",
        successCount: 182,
        failureCount: 8,
        timeoutCount: 2,
        checksumFailureCount: 0,
        averageDownloadSpeed: 8200000,
      },
    ],
  },
  {
    artifactId: "endless-sky-0.10.4",
    gameSlug: "endless-sky",
    version: "0.10.4",
    artifactType: "game",
    filename: "EndlessSky-v0.10.4-win64.zip",
    relativePath: "games/endless-sky/0.10.4/EndlessSky-v0.10.4-win64.zip",
    sizeBytes: 67108864, // ~64 MB
    sha256: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    licenseStatus: "open_source",
    mirrorEnabled: true,
    redistributionAllowed: true,
    vpsStatus: "verified",
    r2Status: "cached",
    r2PromotionScore: 78,
    r2LastPromoted: new Date(Date.now() - 2 * 3600000),
    r2Protected: false,
    r2Disabled: false,
    totalDownloads: 512,
    recentDownloads: 29,
    averageDownloadSpeed: 14000000,
    publicSuccessCount: 390,
    publicFailureCount: 42,
    sources: [
      {
        sourceId: "src-endless-sky-github",
        sourceType: "public",
        url: "https://github.com/endless-sky/endless-sky/releases/download/v0.10.4/EndlessSky-v0.10.4-win64.zip",
        enabled: true,
        priority: 100,
        healthStatus: "healthy",
        successCount: 390,
        failureCount: 42,
        timeoutCount: 5,
        checksumFailureCount: 0,
        averageDownloadSpeed: 5200000,
      },
    ],
  },
];

export async function ensureSeedArtifacts(): Promise<void> {
  await dbConnect();
  await getMirrorSettings();

  const count = await Artifact.countDocuments();
  if (count > 0) return;

  for (const item of INITIAL_ARTIFACTS) {
    const { sources, ...artData } = item;
    await Artifact.findOneAndUpdate(
      { artifactId: artData.artifactId },
      { $set: artData },
      { upsert: true, new: true }
    );

    for (const src of sources) {
      await MirrorSource.findOneAndUpdate(
        { sourceId: src.sourceId },
        { $set: { ...src, artifactId: artData.artifactId } },
        { upsert: true, new: true }
      );
    }
  }
}
