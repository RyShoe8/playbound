import { describe, it, expect } from "vitest";
import { isRetryableConnectionError } from "./db";

/**
 * Which connection failures are worth coming back for.
 *
 * Atlas answers a saturated cluster by completing the TLS handshake and then
 * sending an internal-error alert. The driver labels that RetryableError and
 * SystemOverloadedError — it is telling us to retry — but every caller gave up
 * on the first refusal, so a moment of pressure during a build failed the
 * whole deploy.
 */

const withLabels = (...labels: string[]) =>
  Object.assign(new Error("boom"), { errorLabelSet: new Set(labels) });

describe("retryable", () => {
  it("honours the driver's own labels", () => {
    expect(isRetryableConnectionError(withLabels("RetryableError"))).toBe(true);
    expect(isRetryableConnectionError(withLabels("SystemOverloadedError"))).toBe(true);
  });

  it("recognises the exact alert a full cluster sends", () => {
    // The message seen all evening, verbatim in shape.
    const err = new Error(
      "00325A6A097F0000:error:0A000438:SSL routines:ssl3_read_bytes:tlsv1 alert internal error"
    );
    expect(isRetryableConnectionError(err)).toBe(true);
  });

  it("covers dropped and timed-out sockets", () => {
    expect(isRetryableConnectionError(new Error("read ECONNRESET"))).toBe(true);
    expect(isRetryableConnectionError(new Error("connect ETIMEDOUT"))).toBe(true);
  });
});

describe("not retryable", () => {
  it("does not retry a bad connection string", () => {
    // Retrying a configuration mistake just delays the real error.
    const err = new Error('Invalid scheme, expected connection string to start with "mongodb://"');
    expect(isRetryableConnectionError(err)).toBe(false);
  });

  it("does not retry an auth failure", () => {
    expect(isRetryableConnectionError(new Error("Authentication failed"))).toBe(false);
  });

  it("survives a non-Error being thrown", () => {
    expect(isRetryableConnectionError("nope")).toBe(false);
    expect(isRetryableConnectionError(null)).toBe(false);
    expect(isRetryableConnectionError(undefined)).toBe(false);
  });
});
