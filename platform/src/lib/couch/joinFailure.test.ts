import { describe, expect, it } from "vitest";
import { couchJoinHttpFailure, couchJoinRequestFailure } from "./joinFailure";

describe("couch join diagnostics", () => {
  it("keeps the HTTP status and known server reason", () => {
    expect(couchJoinHttpFailure(410, "Session ended.")).toEqual({
      code: "JOIN_HTTP_410", message: "Couch join returned HTTP 410: Session ended.", httpStatus: 410,
    });
  });

  it("does not copy unexpected response text or request URLs into telemetry", () => {
    expect(couchJoinHttpFailure(500, "secret-controller-token").message).not.toContain("secret-controller-token");
    expect(couchJoinRequestFailure(new Error("https://playbound.club/c/private-code"))).toEqual({
      code: "JOIN_REQUEST_FAILED", message: "Couch join request failed (Error)",
    });
  });
});
