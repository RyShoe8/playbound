/**
 * Minimal WebSocket server (RFC 6455 text frames) for Couch Mode input fallback.
 * Avoids adding the `ws` package as a hard dependency.
 */

"use strict";

const http = require("http");
const crypto = require("crypto");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function acceptKey(secWebSocketKey) {
  return crypto.createHash("sha1").update(secWebSocketKey + GUID).digest("base64");
}

function encodeTextFrame(text) {
  const payload = Buffer.from(String(text), "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrames(buffer, onText) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let hdr = 2;
    if (len === 126) {
      if (offset + 4 > buffer.length) break;
      len = buffer.readUInt16BE(offset + 2);
      hdr = 4;
    } else if (len === 127) {
      if (offset + 10 > buffer.length) break;
      len = Number(buffer.readBigUInt64BE(offset + 2));
      hdr = 10;
    }
    const maskLen = masked ? 4 : 0;
    const total = hdr + maskLen + len;
    if (offset + total > buffer.length) break;
    let payload = buffer.subarray(offset + hdr + maskLen, offset + total);
    if (masked) {
      const mask = buffer.subarray(offset + hdr, offset + hdr + 4);
      const out = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ mask[i % 4];
      payload = out;
    }
    if (opcode === 0x1) onText(payload.toString("utf8"));
    if (opcode === 0x8) return { rest: Buffer.alloc(0), closed: true };
    offset += total;
  }
  return { rest: buffer.subarray(offset), closed: false };
}

/**
 * @param {(socket: { send: (s: string) => void, close: () => void }, msg: string) => void} onMessage
 */
function createPlainWebSocketServer(onMessage) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("PlayBound Couch Input");
  });

  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }
    const headers = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey(key)}`,
      "\r\n",
    ];
    socket.write(headers.join("\r\n"));

    let buf = Buffer.alloc(0);
    const api = {
      send(text) {
        try {
          socket.write(encodeTextFrame(text));
        } catch {
          /* ignore */
        }
      },
      close() {
        try {
          socket.end();
        } catch {
          /* ignore */
        }
      },
    };

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const result = decodeFrames(buf, (text) => onMessage(api, text));
      buf = result.rest;
      if (result.closed) api.close();
    });
    socket.on("error", () => {});
  });

  return {
    server,
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "0.0.0.0", () => {
          const addr = server.address();
          resolve(typeof addr === "object" && addr ? addr.port : 0);
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { createPlainWebSocketServer };
