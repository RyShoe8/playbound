/**
 * Verify one migrated object and, only with --apply, enable S3 as its archive.
 * Requires deployment Mongo credentials and S3_ARCHIVE_* in the environment.
 * Never modifies catalog game/edition/mod documents or uploads bytes.
 *
 * Usage: npx tsx scripts/verify-s3-archive.ts <artifact-id> [--apply]
 */
import { loadEnvConfig } from "@next/env";
import dbConnect from "../src/lib/db";
import Artifact from "../src/lib/models/Artifact";
import { hashS3ArchiveObject } from "../src/lib/mirrors/s3Archive";

loadEnvConfig(process.cwd());

async function main() {
  const id = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!id || id.startsWith("--") || process.argv.some((arg, index) => index > 2 && arg !== "--apply")) {
    throw new Error("Usage: npx tsx scripts/verify-s3-archive.ts <artifact-id> [--apply]");
  }
  await dbConnect();
  const artifact = await Artifact.findOne({ artifactId: id }).lean();
  if (!artifact) throw new Error(`Artifact ${id} does not exist`);
  if (!/^[a-f0-9]{64}$/i.test(artifact.sha256) || !Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
    throw new Error("Artifact needs a trusted SHA-256 and byte length before S3 verification");
  }
  const actual = await hashS3ArchiveObject(artifact.relativePath);
  const matches = actual.sizeBytes === artifact.sizeBytes && actual.sha256.toLowerCase() === artifact.sha256.toLowerCase();
  console.log(JSON.stringify({ artifactId: id, key: artifact.relativePath, expectedBytes: artifact.sizeBytes,
    actualBytes: actual.sizeBytes, sha256Match: actual.sha256.toLowerCase() === artifact.sha256.toLowerCase(),
    status: matches ? "verified" : "mismatch", applied: false }));
  if (!matches) throw new Error("S3 object differs from the trusted artifact; existing archive remains authoritative");
  if (!apply) return;
  const result = await Artifact.updateOne(
    { _id: artifact._id, artifactId: id, relativePath: artifact.relativePath,
      sha256: artifact.sha256, sizeBytes: artifact.sizeBytes },
    { $set: { s3ArchiveStatus: "verified" } }
  );
  if (result.matchedCount !== 1) throw new Error("Artifact changed during verification; S3 status was not updated");
  console.log(`Applied S3 verification for ${id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
