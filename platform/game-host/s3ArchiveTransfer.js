import { createHash } from "node:crypto";
import { httpsGetStream } from "./downloadStream.js";

/** Stream an approved HTTPS source through bounded multipart buffers to S3. */
export async function transferUrlToS3({ key, url, sizeBytes, sha256, secret, site, onProgress, request = fetch, getStream = httpsGetStream }) {
  if (!/^https:\/\//i.test(url) || !secret || !site || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Invalid S3 archive transfer request");
  }
  const control = async (action, fields = {}) => {
    const response = await request(`${site.replace(/\/+$/, "")}/api/internal/archive-transfer`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ key, action, ...fields }),
      signal: AbortSignal.timeout(30_000),
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`S3 transfer ${action} failed: HTTP ${response.status} ${value.error || ""}`);
    return value;
  };
  const existing = await control("get");
  if (existing.exists) throw new Error("S3 object already exists; verify it before replacing");
  const started = await control("start");
  const uploadId = started.uploadId;
  if (!uploadId) throw new Error("Ceph did not return a multipart upload ID");
  let complete = false;
  try {
    const { statusCode, stream } = await getStream(url);
    if (statusCode !== 200) {
      stream.resume();
      throw new Error(`Archive source returned HTTP ${statusCode}`);
    }
    const hash = createHash("sha256");
    const parts = [];
    const partBytes = 64 * 1024 * 1024;
    let pending = [];
    let pendingBytes = 0;
    let received = 0;
    let uploaded = 0;
    const sendPart = async () => {
      if (!pendingBytes) return;
      const body = Buffer.concat(pending, pendingBytes);
      pending = [];
      pendingBytes = 0;
      const partNumber = parts.length + 1;
      const signed = await control("part", { uploadId, partNumber });
      const response = await request(signed.url, {
        method: "PUT", body, headers: { "content-length": String(body.length) },
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      const etag = response.headers.get("etag");
      if (!response.ok || !etag) throw new Error(`S3 part ${partNumber} failed: HTTP ${response.status}`);
      parts.push({ partNumber, etag });
      uploaded += body.length;
      onProgress?.(uploaded, sizeBytes);
    };
    for await (const chunk of stream) {
      received += chunk.length;
      if (received > sizeBytes) throw new Error("Archive source exceeds expected byte length");
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const take = Math.min(partBytes - pendingBytes, chunk.length - offset);
        pending.push(chunk.subarray(offset, offset + take));
        pendingBytes += take;
        offset += take;
        if (pendingBytes === partBytes) await sendPart();
      }
    }
    if (received !== sizeBytes) throw new Error(`Archive size mismatch: expected ${sizeBytes}, received ${received}`);
    const sourceHash = hash.digest("hex");
    if (sha256 && sourceHash.toLowerCase() !== sha256.toLowerCase()) throw new Error("Archive source SHA-256 mismatch");
    await sendPart();
    await control("complete", { uploadId, parts });
    complete = true;
    const destination = await control("get");
    if (!destination.exists || destination.sizeBytes !== sizeBytes) throw new Error("S3 object is missing or has the wrong size");
    const { statusCode: verifyStatus, stream: verifyStream } = await getStream(destination.url);
    if (verifyStatus !== 200) {
      verifyStream.resume();
      throw new Error(`S3 verification GET returned HTTP ${verifyStatus}`);
    }
    const verifyHash = createHash("sha256");
    let verifiedBytes = 0;
    for await (const chunk of verifyStream) { verifyHash.update(chunk); verifiedBytes += chunk.length; }
    if (verifiedBytes !== sizeBytes || verifyHash.digest("hex") !== sourceHash) throw new Error("S3 copy failed full byte verification");
    const marked = await control("mark", { sha256: sourceHash, sizeBytes });
    return { sizeBytes, sha256: sourceHash, artifactMarked: Boolean(marked.artifactMarked) };
  } finally {
    if (!complete) await control("abort", { uploadId }).catch(() => {});
  }
}
