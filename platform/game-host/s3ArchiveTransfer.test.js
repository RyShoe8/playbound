import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { transferUrlToS3 } from "./s3ArchiveTransfer.js";

function fixture(source = Buffer.from("game bytes")) {
  const calls = [];
  let exists = false;
  let uploaded = null;
  const request = async (url, options) => {
    if (url === "https://signed.example/part") {
      uploaded = Buffer.from(options.body);
      return new Response(null, { status: 200, headers: { etag: '"d41d8cd98f00b204e9800998ecf8427e"' } });
    }
    const input = JSON.parse(options.body);
    calls.push(input.action);
    if (input.action === "get") return Response.json(exists
      ? { exists: true, sizeBytes: uploaded.length, url: "https://signed.example/get" }
      : { exists: false });
    if (input.action === "start") return Response.json({ uploadId: "2~test" });
    if (input.action === "part") return Response.json({ url: "https://signed.example/part" });
    if (input.action === "complete") { exists = true; return Response.json({ complete: true }); }
    if (input.action === "mark") return Response.json({ verified: true, artifactMarked: true });
    if (input.action === "abort") return Response.json({ aborted: true });
    throw new Error(`Unexpected ${input.action}`);
  };
  const getStream = async (url) => ({ statusCode: 200, stream: Readable.from([url.includes("signed.example") ? uploaded : source]) });
  return { calls, request, getStream, source, get uploaded() { return uploaded; } };
}

test("direct S3 archive verifies source and complete destination before marking", async () => {
  const f = fixture();
  const sha256 = createHash("sha256").update(f.source).digest("hex");
  const result = await transferUrlToS3({
    key: "games/example/file.zip", url: "https://mirror.playbound.club/games/example/file.zip",
    sizeBytes: f.source.length, sha256, secret: "test", site: "https://playbound.club",
    request: f.request, getStream: f.getStream,
  });
  assert.equal(result.sha256, sha256);
  assert.deepEqual(f.uploaded, f.source);
  assert.deepEqual(f.calls, ["get", "start", "part", "complete", "get", "mark"]);
});

test("bad source checksum aborts multipart upload before completion", async () => {
  const f = fixture();
  await assert.rejects(transferUrlToS3({
    key: "games/example/file.zip", url: "https://mirror.playbound.club/games/example/file.zip",
    sizeBytes: f.source.length, sha256: "0".repeat(64), secret: "test", site: "https://playbound.club",
    request: f.request, getStream: f.getStream,
  }), /SHA-256 mismatch/);
  assert.deepEqual(f.calls, ["get", "start", "abort"]);
});
