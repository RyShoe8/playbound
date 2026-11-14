import crypto from "node:crypto";
import { Readable } from "node:stream";
import { list, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import MixtapeUpload from "@/lib/models/MixtapeUpload";
import { checkR2ObjectExists, uploadStreamToR2, r2HotcacheConfigured } from "@/lib/mirrors/r2Client";
import { SITE_URL } from "@/lib/site";
import { validateUpload, validAssetName } from "@/lib/mixtape/storage";
export const maxDuration = 120;

/*
 * Music goes from the Blob staging upload straight to R2. It used to pass
 * through the game VPS, which checked the checksum and was then read back
 * from mirror.playbound.club; that hostname now serves the S3 game archive
 * only, and the VPS hosts game servers only. Tracks are capped at 50 MiB, so
 * the staged file is read whole and its SHA-256 checked before anything is
 * written to R2: a damaged upload never reaches the bucket.
 */
export async function POST(req: Request) {
  const { session, error } = await requireAdminSession(); if (error) return error;
  if (!r2HotcacheConfigured() || !process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Music upload pipeline is not configured" }, { status: 503 });
  try {
    const body = await req.json(), userId = session!.user.id;
    if (!body.action) {
      const { extension, contentType, size } = validateUpload(body);
      if (!/^[a-f0-9]{64}$/.test(String(body.sha256))) throw new Error("File checksum required");
      const name = `${crypto.randomUUID()}.${extension}`;
      await MixtapeUpload.create({ name, userId, size, contentType, sha256: body.sha256 });
      return NextResponse.json({ name, pathname: `mixtape-staging/${name}`, contentType });
    }
    if (!validAssetName(body.name)) throw new Error("Invalid music object");
    const job = await MixtapeUpload.findOne({ name: body.name, userId });
    if (!job) throw new Error("Upload not found");
    const key = `mixtape/${job.name}`;
    const ready = async (stagingUrl?: string | null) => {
      // Remove temporary staging only after the final R2 object has been verified.
      const staging = stagingUrl || job.sourceUrl;
      if (staging) await del(staging);
      await MixtapeUpload.updateOne({ name: job.name }, { $set: { state: "ready", leaseUntil: null } });
      return NextResponse.json({ state: "ready", url: `${SITE_URL}/api/mixtape/assets/${job.name}` });
    };
    if (job.state === "ready") return ready();
    if (!["archive", "status"].includes(body.action)) throw new Error("Invalid upload action");

    // Resolve from our own Blob store; never fetch an arbitrary caller-supplied URL.
    const staged = await list({ prefix: `mixtape-staging/${job.name}`, limit: 10 });
    const blob = staged.blobs.find(b => b.pathname === `mixtape-staging/${job.name}`);
    const existing = await checkR2ObjectExists(key);
    if (existing.exists && existing.sizeBytes === job.size) return ready(blob?.url);
    if (!blob || blob.size !== job.size) throw new Error("Staging upload size does not match");

    const lock = await MixtapeUpload.findOneAndUpdate({ name: job.name, userId, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date() } }] }, { $set: { state: "promoting", sourceUrl: blob.url, leaseUntil: new Date(Date.now() + 150_000) } });
    if (!lock) return NextResponse.json({ state: "promoting", message: "Verifying checksum and copying to R2…" });
    try {
      const response = await fetch(blob.url, { signal: AbortSignal.timeout(90_000) });
      if (!response.ok) throw new Error(`Staging file fetch failed (${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== job.size) throw new Error("Staging file size does not match");
      if (crypto.createHash("sha256").update(bytes).digest("hex") !== job.sha256) throw new Error("Staging file checksum does not match");
      const result = await uploadStreamToR2(key, Readable.from(bytes), job.size, job.contentType);
      if (!result.success) throw new Error(result.error || "R2 upload failed");
      const verified = await checkR2ObjectExists(key);
      if (!verified.exists || verified.sizeBytes !== job.size) throw new Error("R2 file verification failed");
      return await ready(blob.url);
    } catch (err) {
      await MixtapeUpload.updateOne({ name: job.name }, { $set: { state: "staging", leaseUntil: null } });
      throw err;
    }
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 }); }
}
