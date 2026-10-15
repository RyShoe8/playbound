"use strict";

const retryTimers = new WeakMap();
const transient = error => /\b(?:status\s*[:=]?\s*|HTTP\s+)(?:408|429|500|502|503|504)\b|ECONNRESET|ETIMEDOUT|fetch failed/i.test(String(error?.message || error));
const scheduleRetry = (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref?.(); return () => clearTimeout(timer); };

/** Own both promises, and refresh the feed before a bounded transient retry. */
async function checkWithHandledDownload(updater, onDownloadError = () => {}, { retryLimit = 2, attempt = 0, schedule = scheduleRetry } = {}) {
  retryTimers.get(updater)?.(); retryTimers.delete(updater);
  const result = await updater.checkForUpdates();
  if (result?.downloadPromise) {
    void Promise.resolve(result.downloadPromise).catch(error => {
      // Error observers must never create another unhandled rejection.
      try { onDownloadError(error); } catch { /* The updater error event also reports failure. */ }
      if (attempt < retryLimit && transient(error) && !retryTimers.has(updater)) {
        const cancel = schedule(() => {
          retryTimers.delete(updater);
          // A fresh check obtains a new signed URL instead of reusing a stale redirect.
          void checkWithHandledDownload(updater, onDownloadError, { retryLimit, attempt: attempt + 1, schedule }).catch(failure => {
            try { onDownloadError(failure); } catch { /* Keep background checks contained. */ }
          });
        }, 15_000 * 2 ** attempt);
        retryTimers.set(updater, cancel);
      }
    });
  }
  return result;
}

function safeUpdateError(error) {
  return String(error?.message || error || "Update download failed")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[download URL]")
    .slice(0, 1000);
}

module.exports = { checkWithHandledDownload, safeUpdateError };
