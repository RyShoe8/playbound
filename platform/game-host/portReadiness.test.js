import { test } from "node:test";
import assert from "node:assert/strict";
import { isLinuxPortBound, procNetHasPort } from "./portReadiness.js";

const header = "  sl  local_address rem_address   st tx_queue rx_queue\n";

test("observes a bound UDP server without binding its port", () => {
  const table = `${header}  1: 00000000:6A54 00000000:0000 07 00000000:00000000\n`;
  const reads = [];
  const readFile = (file) => { reads.push(file); return file.endsWith("/udp") ? table : header; };
  assert.equal(isLinuxPortBound(27220, "udp", readFile), true);
  assert.deepEqual(reads, ["/proc/net/udp"]);
  assert.equal(procNetHasPort(table, 27221), false);
});

test("only listening TCP sockets count and IPv6 tables may be absent", () => {
  const table = `${header}  1: 00000000:6A54 00000000:0000 01 00000000:00000000\n`;
  assert.equal(procNetHasPort(table, 27220, true), false);
  assert.equal(procNetHasPort(table.replace(" 01 ", " 0A "), 27220, true), true);
  assert.equal(isLinuxPortBound(27220, "tcp", (file) => {
    if (file.endsWith("tcp6")) throw new Error("IPv6 disabled");
    return header;
  }), false);
});
