const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");

const {
  findCli,
  parseOverlayPeers,
  summarizeOverlayDetail,
  describeOverlayDetail,
} = require("./virtualLan");

test("findCli returns null when NetBird is not installed (no bare name)", () => {
  const prevPath = process.env.PATH;
  const prevLocal = process.env.LOCALAPPDATA;
  const prevPf = process.env.ProgramFiles;
  const prevPf86 = process.env["ProgramFiles(x86)"];
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "pb-nobird-"));
  try {
    process.env.PATH = empty;
    process.env.LOCALAPPDATA = empty;
    process.env.ProgramFiles = empty;
    process.env["ProgramFiles(x86)"] = empty;
    // Re-require would cache — findCli reads env each call, so this is enough.
    assert.equal(findCli(), null);
  } finally {
    process.env.PATH = prevPath;
    process.env.LOCALAPPDATA = prevLocal;
    process.env.ProgramFiles = prevPf;
    process.env["ProgramFiles(x86)"] = prevPf86;
    try {
      fs.rmSync(empty, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});


/* ── overlay peer diagnostics ─────────────────────────────────────────────── */

const SAMPLE_DETAIL = [
  "Peers detail:",
  " alice-pc.netbird.cloud:",
  "  NetBird IP: 100.94.0.7/16",
  "  Public key: abc123",
  "  Status: Connected",
  "  -- detail --",
  "  Connection type: P2P",
  "  ICE candidate (Local/Remote): host/srflx",
  "  Latency: 24.318ms",
  "",
  " bob-pc.netbird.cloud:",
  "  NetBird IP: 100.94.0.9/16",
  "  Status: Connected",
  "  Connection type: Relayed",
  "  Latency: 118ms",
  "",
  "Peers count: 2/2 Connected",
  "Management: Connected",
  "Signal: Connected",
  "Relays: 1/1 Available",
].join("\n");

test("reads each peer's connection type and latency", () => {
  const peers = parseOverlayPeers(SAMPLE_DETAIL);
  assert.equal(peers.length, 2);
  assert.equal(peers[0].name, "alice-pc.netbird.cloud");
  assert.equal(peers[0].ip, "100.94.0.7");
  assert.equal(peers[0].relayed, false);
  assert.equal(peers[0].latencyMs, 24.3);
  // The one that matters: relayed is the failure mode worth naming.
  assert.equal(peers[1].relayed, true);
  assert.equal(peers[1].latencyMs, 118);
});

test("summarizes direct vs relayed and the worst latency", () => {
  const s = summarizeOverlayDetail(SAMPLE_DETAIL);
  assert.equal(s.directCount, 1);
  assert.equal(s.relayedCount, 1);
  assert.equal(s.unknownCount, 0);
  assert.equal(s.worstLatencyMs, 118);
  assert.equal(s.management, "Connected");
  assert.equal(s.relays, "1/1 Available");
});

test("says plainly when traffic is relayed", () => {
  const line = describeOverlayDetail({ available: true, ...summarizeOverlayDetail(SAMPLE_DETAIL) });
  assert.match(line, /relayed=1/);
  assert.match(line, /RELAYED/);
});

test("an all-direct overlay is not flagged", () => {
  const direct = SAMPLE_DETAIL.replace("Connection type: Relayed", "Connection type: P2P");
  const line = describeOverlayDetail({ available: true, ...summarizeOverlayDetail(direct) });
  assert.match(line, /direct=2/);
  assert.doesNotMatch(line, /RELAYED/);
});

test("an unfamiliar layout yields nulls rather than a wrong reading", () => {
  /*
   * NetBird's detail output has changed between releases. This is diagnostic
   * data, so the cost of guessing wrong is a misleading latency verdict —
   * worse than admitting the format was not recognised.
   */
  const s = summarizeOverlayDetail("something entirely unexpected\nno peers here");
  assert.equal(s.peers.length, 0);
  assert.equal(s.worstLatencyMs, null);
  assert.equal(s.relayedCount, 0);
  assert.doesNotThrow(() => summarizeOverlayDetail(undefined));
});

test("latency units other than milliseconds are normalised", () => {
  const secs = SAMPLE_DETAIL.replace("Latency: 118ms", "Latency: 1.2s");
  const peers = parseOverlayPeers(secs);
  assert.equal(peers[1].latencyMs, 1200);
});
