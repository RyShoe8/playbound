const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

/** Await writes and closure, including open errors and errors during backpressure. */
async function writeDownloadBody(body, output, { signal, onChunk, gate } = {}) {
  const progress = new Transform({
    transform(chunk, encoding, callback) {
      try {
        onChunk?.(chunk.length);
      } catch (err) {
        callback(err);
        return;
      }
      // Holding a chunk back stops reading from the network, which is the pause.
      if (!gate) {
        callback(null, chunk);
        return;
      }
      Promise.resolve(gate(chunk.length)).then(() => callback(null, chunk), callback);
    },
  });
  await pipeline(Readable.fromWeb(body), progress, output, { signal });
}

module.exports = { writeDownloadBody };
