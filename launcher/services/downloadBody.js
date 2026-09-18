const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

/** Await writes and closure, including open errors and errors during backpressure. */
async function writeDownloadBody(body, output, { signal, onChunk } = {}) {
  const progress = new Transform({
    transform(chunk, encoding, callback) {
      try {
        onChunk?.(chunk.length);
        callback(null, chunk);
      } catch (err) {
        callback(err);
      }
    },
  });
  await pipeline(Readable.fromWeb(body), progress, output, { signal });
}

module.exports = { writeDownloadBody };
