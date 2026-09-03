/**
 * How fast a download is going, and how long it has left.
 *
 * A progress bar answers "how far", which is not the question someone asks
 * when an install has been sitting at 40% for a while. This answers "how
 * long", which is the one that decides whether they wait or assume it hung.
 *
 * Measured over a moving window rather than since the start. A download that
 * opens at 90 MB/s and then settles at 4 should report 4 — a cumulative
 * average keeps flattering the first few seconds long after they stopped being
 * true, and the ETA it produces is a lie that keeps growing.
 *
 * Run: node services/transferMeter.test.js
 */

const DEFAULT_WINDOW_MS = 5000;

/**
 * Below this there is not enough signal to divide by: chunk arrival is bursty,
 * and a rate computed over 200ms swings between numbers that are both wrong.
 * Reporting nothing is better than reporting noise — the caller shows bytes
 * only until this settles, which is roughly one second in.
 */
const MIN_SAMPLE_MS = 900;

function createTransferMeter({ windowMs = DEFAULT_WINDOW_MS } = {}) {
  /** @type {{ at: number, received: number }[]} */
  let samples = [];

  /**
   * @param {number} received bytes so far
   * @param {number} total expected bytes, 0 when the server did not say
   * @param {number} now injectable so the tests do not have to sleep
   */
  function update(received, total, now = Date.now()) {
    /*
     * Going backwards means a retry restarted the file. Keeping the old
     * samples would compute a negative rate and, worse, an ETA in the past.
     */
    if (samples.length && received < samples[samples.length - 1].received) {
      samples = [];
    }

    samples.push({ at: now, received });
    while (samples.length > 2 && now - samples[0].at > windowMs) samples.shift();

    const first = samples[0];
    const elapsed = now - first.at;
    const moved = received - first.received;

    const bytesPerSecond =
      elapsed >= MIN_SAMPLE_MS && moved > 0 ? Math.round((moved / elapsed) * 1000) : null;

    const remaining = total > 0 && total > received ? total - received : null;
    const etaMs =
      bytesPerSecond && remaining ? Math.round((remaining / bytesPerSecond) * 1000) : null;

    return { bytesPerSecond, etaMs };
  }

  function reset() {
    samples = [];
  }

  return { update, reset };
}

module.exports = { createTransferMeter, MIN_SAMPLE_MS, DEFAULT_WINDOW_MS };
