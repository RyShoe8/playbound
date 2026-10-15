import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { httpsGetStream } from "./downloadStream.js";

test("manual redirect mode exposes Location without following an unchecked destination", { timeout: 5000 }, async () => {
  let targetVisited = false;
  const server = http.createServer((req, res) => {
    if (req.url === "/target") targetVisited = true;
    res.writeHead(302, { Location: "/target" });res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await httpsGetStream(`http://127.0.0.1:${server.address().port}/redirect`, { followRedirects: false, maxRedirects: 0 });
    assert.equal(response.statusCode, 302);assert.equal(response.headers.location, "/target");assert.equal(targetVisited, false);
    response.stream.destroy();
  } finally { server.closeAllConnections();await new Promise((resolve) => server.close(resolve)); }
});

test("preserves initial bytes while the archive consumer prepares its file", { timeout: 5000 }, async () => {
  const payload = Buffer.alloc(256 * 1024, 0x5a);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Length": payload.length });
    res.write(payload.subarray(0, 16 * 1024));
    setTimeout(() => res.end(payload.subarray(16 * 1024)), 10);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { stream } = await httpsGetStream(`http://127.0.0.1:${server.address().port}/file`);
    // Archive retries can await rm/stat before attaching their file pipeline.
    await delay(50);
    const chunks = [];
    await pipeline(stream, new Writable({
      write(chunk, encoding, callback) { chunks.push(chunk); callback(); },
    }));
    assert.deepEqual(Buffer.concat(chunks), payload);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("preserves exact Range response bytes after a redirect", { timeout: 5000 }, async () => {
  const payload = Buffer.from("remaining archive bytes");
  const server = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/archive" });
      res.end();
      return;
    }
    assert.equal(req.headers.range, "bytes=100-");
    res.writeHead(206, { "Content-Length": payload.length });
    res.end(payload);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { stream, statusCode } = await httpsGetStream(
      `http://127.0.0.1:${server.address().port}/redirect`, { headers: { Range: "bytes=100-" } }
    );
    assert.equal(statusCode, 206);
    await delay(50);
    const chunks = [];
    await pipeline(stream, new Writable({
      write(chunk, encoding, callback) { chunks.push(chunk); callback(); },
    }));
    assert.deepEqual(Buffer.concat(chunks), payload);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
