/**
 * Rolling latency / rate metrics for Couch Mode debug UI.
 */

"use strict";

function createMetrics() {
  /** @type {Map<string, object>} */
  const byController = new Map();

  function touch(controllerId) {
    let m = byController.get(controllerId);
    if (!m) {
      m = {
        controllerId,
        transport: "unknown",
        samples: [],
        packets: 0,
        lastSeq: -1,
        lossGuess: 0,
        hzWindow: [],
      };
      byController.set(controllerId, m);
    }
    return m;
  }

  function recordPacket(controllerId, opts) {
    const m = touch(controllerId);
    const now = Date.now();
    m.transport = opts.transport || m.transport;
    m.packets += 1;
    if (typeof opts.captureToHostMs === "number" && Number.isFinite(opts.captureToHostMs)) {
      m.samples.push(opts.captureToHostMs);
      if (m.samples.length > 120) m.samples.shift();
    }
    if (typeof opts.seq === "number") {
      if (m.lastSeq >= 0 && opts.seq > m.lastSeq + 1) {
        m.lossGuess += opts.seq - m.lastSeq - 1;
      }
      m.lastSeq = opts.seq;
    }
    m.hzWindow.push(now);
    m.hzWindow = m.hzWindow.filter((t) => now - t < 1000);
  }

  function setTransport(controllerId, transport) {
    touch(controllerId).transport = transport;
  }

  function snapshot() {
    const out = [];
    for (const m of byController.values()) {
      const samples = m.samples;
      const avg =
        samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
      let jitter = null;
      if (samples.length > 1) {
        const mean = avg;
        jitter = Math.sqrt(
          samples.reduce((s, x) => s + (x - mean) * (x - mean), 0) / samples.length
        );
      }
      out.push({
        controllerId: m.controllerId,
        transport: m.transport,
        pingMs: avg != null ? Math.round(avg * 10) / 10 : null,
        jitterMs: jitter != null ? Math.round(jitter * 10) / 10 : null,
        packetLoss: m.packets > 0 ? m.lossGuess / (m.packets + m.lossGuess) : 0,
        hz: m.hzWindow.length,
        packets: m.packets,
      });
    }
    return out;
  }

  function clear() {
    byController.clear();
  }

  return { recordPacket, setTransport, snapshot, clear, touch };
}

module.exports = { createMetrics };
