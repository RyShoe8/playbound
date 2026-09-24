"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { createPlainWebSocketServer } = require("./wsServer");

test("a peer closing during WebSocket upgrade cannot emit an uncaught EPIPE", async () => {
  const { server } = createPlainWebSocketServer(() => {}, { verifyUpgrade: () => false });
  const socket = new EventEmitter();
  let destroyed = false;
  socket.write = () => {
    process.nextTick(() => {
      socket.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
    });
    return true;
  };
  socket.destroy = () => { destroyed = true; };

  server.emit("upgrade", { headers: { "sec-websocket-key": "test" } }, socket);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(destroyed, true);
});
