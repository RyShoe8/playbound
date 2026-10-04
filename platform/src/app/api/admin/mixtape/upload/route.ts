import crypto from "node:crypto";
import { list, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import MixtapeUpload from "@/lib/models/MixtapeUpload";
import { archiveArtifactOnHost, archivedArtifactStatusOnHost } from "@/lib/gameHost/client";
import { getMirrorSettings } from "@/lib/mirrors/cacheManager";
import { checkR2ObjectExists, uploadStreamToR2, r2HotcacheConfigured } from "@/lib/mirrors/r2Client";
import { SITE_URL } from "@/lib/site";
import { validateUpload, validAssetName } from "@/lib/mixtape/storage";
export const maxDuration = 120;
export async function POST(req: Request) {
  const { session, error } = await requireAdminSession(); if (error) return error;
  if (!r2HotcacheConfigured() || !process.env.BLOB_READ_WRITE_TOKEN || !process.env.GAME_HOST_URL || !process.env.GAME_HOST_SECRET) return NextResponse.json({ error: "Music upload pipeline is not configured" }, { status: 503 });
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
    const ready = async () => {
      // Remove temporary staging only after the final R2 object has been verified.
      if (job.sourceUrl) await del(job.sourceUrl);
      await MixtapeUpload.updateOne({ name: job.name }, { $set: { state: "ready", leaseUntil: null } });
      return NextResponse.json({ state: "ready", url: `${SITE_URL}/api/mixtape/assets/${job.name}` });
    };
    if (job.state === "ready") return ready();
    if (!["archive", "status"].includes(body.action)) throw new Error("Invalid upload action");
    if (body.action === "archive" || job.state === "staging") {
      // Resolve from our own Blob store; never fetch an arbitrary caller-supplied URL.
      const staged = await list({ prefix: `mixtape-staging/${job.name}`, limit: 10 });
      const blob = staged.blobs.find(b => b.pathname === `mixtape-staging/${job.name}`);
      if (!blob || blob.size !== job.size) throw new Error("Staging upload size does not match");
      const archive = await archiveArtifactOnHost({ url: blob.url, relativePath: key, sizeBytes: job.size, sha256: job.sha256 });
      if (!archive.success) throw new Error(archive.message || "VPS archive failed");
      await MixtapeUpload.updateOne({ name: job.name }, { $set: { sourceUrl: blob.url, state: "archiving" } });
      return NextResponse.json({ state: "archiving", message: "Copying to VPS and verifying checksum…" });
    }
    if (body.action !== "status") throw new Error("Invalid upload action");
    const status = await archivedArtifactStatusOnHost(key);
    if (!status || status.status === "missing") throw new Error(status?.message || "VPS archive unavailable");
    if (status.status !== "verified") return NextResponse.json({ state: "archiving", message: "Copying to VPS and verifying checksum…", bytesReceived: status.bytesReceived });
    if (status.sizeBytes !== job.size) throw new Error("VPS archive size does not match");
    const existing = await checkR2ObjectExists(key);
    if (existing.exists && existing.sizeBytes === job.size) return ready();
    const lock = await MixtapeUpload.findOneAndUpdate({ name: job.name, userId, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date() } }] }, { $set: { state: "promoting", leaseUntil: new Date(Date.now() + 150_000) } });
    if (!lock) return NextResponse.json({ state: "promoting", message: "Transferring verified VPS file to R2…" });
    try {
      const settings = await getMirrorSettings();
      const base = (settings.vpsMirrorBaseUrl || "https://mirror.playbound.club").replace(/\/+$/, "");
      const response = await fetch(`${base}/${key}`, { signal: AbortSignal.timeout(90_000) });
      if (!response.ok || !response.body) throw new Error(`VPS file fetch failed (${response.status})`);
      if (Number(response.headers.get("content-length")) !== job.size) throw new Error("VPS response size does not match");
      const result = await uploadStreamToR2(key, response.body, job.size, job.contentType);
      if (!result.success) throw new Error(result.error || "R2 promotion failed");
      const verified = await checkR2ObjectExists(key);
      if (!verified.exists || verified.sizeBytes !== job.size) throw new Error("R2 file verification failed");
      return await ready();
    } catch (err) {
      await MixtapeUpload.updateOne({ name: job.name }, { $set: { state: "archiving", leaseUntil: null } });
      throw err;
    }
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 }); }
}
