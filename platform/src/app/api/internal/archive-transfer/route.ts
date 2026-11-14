import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import {
  headS3ArchiveObject, s3ArchiveClient, s3ArchiveConfig, safeS3ArchiveKey,
  signedS3ArchiveDownloadUrl,
} from "@/lib/mirrors/s3Archive";

export const maxDuration = 30;

function hostAuthorized(req: Request) {
  const secret = process.env.GAME_HOST_SECRET;
  if (!secret) return false;
  const actual = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function archiveKey(value: unknown): string {
  if (typeof value !== "string" || value.length > 450) throw new Error("Invalid archive key");
  const key = safeS3ArchiveKey(value);
  if (!["games/", "launcher-packages/", "artifacts/"].some((prefix) => key.startsWith(prefix))) throw new Error("Archive key outside game packages");
  return key;
}

function uploadId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 500 || !/^[A-Za-z0-9+/_=.~!\-]+$/.test(value)) {
    throw new Error("Invalid multipart upload ID");
  }
  return value;
}

export async function POST(req: Request) {
  if (!hostAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let s3;
  try {
    const input = await req.json() as Record<string, unknown>;
    const key = archiveKey(input.key);
    const config = s3ArchiveConfig();
    if (!config) throw new Error("S3 archive is not configured");
    if (input.action === "get") {
      const head = await headS3ArchiveObject(key);
      if (!head.exists) return NextResponse.json({ exists: false });
      return NextResponse.json({ exists: true, sizeBytes: head.sizeBytes,
        url: await signedS3ArchiveDownloadUrl(key, key.split("/").at(-1) || "download") });
    }
    s3 = s3ArchiveClient(config);
    if (input.action === "start") {
      const head = await headS3ArchiveObject(key);
      if (head.exists) return NextResponse.json({ error: "Object already exists; verify it before replacing" }, { status: 409 });
      const result = await s3.send(new CreateMultipartUploadCommand({
        Bucket: config.bucket, Key: key, ContentType: "application/octet-stream",
      }));
      if (!result.UploadId) throw new Error("Ceph did not return a multipart upload ID");
      return NextResponse.json({ uploadId: result.UploadId });
    }
    if (input.action === "part") {
      const partNumber = Number(input.partNumber);
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new Error("Invalid part number");
      const url = await getSignedUrl(s3, new UploadPartCommand({
        Bucket: config.bucket, Key: key, UploadId: uploadId(input.uploadId), PartNumber: partNumber,
      }), { expiresIn: 900 });
      return NextResponse.json({ url });
    }
    if (input.action === "complete") {
      const rawParts = input.parts;
      if (!Array.isArray(rawParts) || rawParts.length < 1 || rawParts.length > 10000) throw new Error("Invalid parts list");
      const parts = rawParts.map((part, index) => {
        const p = part as { partNumber?: unknown; etag?: unknown };
        if (Number(p.partNumber) !== index + 1 || typeof p.etag !== "string" || !/^"?[a-fA-F0-9]{32}(?:-\d+)?"?$/.test(p.etag)) {
          throw new Error("Invalid multipart part receipt");
        }
        return { PartNumber: index + 1, ETag: p.etag };
      });
      await s3.send(new CompleteMultipartUploadCommand({
        Bucket: config.bucket, Key: key, UploadId: uploadId(input.uploadId), MultipartUpload: { Parts: parts },
      }));
      return NextResponse.json({ complete: true });
    }
    if (input.action === "abort") {
      await s3.send(new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId(input.uploadId) }));
      return NextResponse.json({ aborted: true });
    }
    if (input.action === "mark") {
      const sha256 = input.sha256;
      const sizeBytes = input.sizeBytes;
      if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(sha256) ||
          typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
        throw new Error("Invalid verified file digest");
      }
      const head = await headS3ArchiveObject(key);
      if (!head.exists || head.sizeBytes !== sizeBytes) throw new Error("S3 object size does not match verified source");
      await dbConnect();
      // Only existing operational artifact rows may be marked; game content is untouched.
      const updated = await Artifact.updateOne(
        { relativePath: key, sizeBytes, sha256: { $in: [sha256, ""] } },
        { $set: { sha256, s3ArchiveStatus: "verified" } }
      );
      return NextResponse.json({ verified: true, artifactMarked: updated.matchedCount === 1 });
    }
    throw new Error("Unknown transfer action");
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = error instanceof Error ? error.name : "unknown";
    console.error("S3 archive transfer action failed:", { action: "request", name, status });
    const detail = status ? `S3 request failed (HTTP ${status}; ${name})` : error instanceof Error ? error.message : "Transfer action failed";
    return NextResponse.json({ error: detail }, { status: 400 });
  } finally {
    s3?.destroy();
  }
}
