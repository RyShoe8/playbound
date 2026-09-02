import { describe, it, expect } from "vitest";
import { isClientNetworkFailure } from "./autoBugReport";

describe("client network failures are not catalog bugs", () => {
  it("recognises the launcher's own wording for a dead connection", () => {
    // Verbatim from a filed report: the launcher appends the game's website to
    // every download failure, so the text also accuses a mirror that was fine.
    expect(
      isClientNetworkFailure(
        "Download failed (EAI_AGAIN). Open https://www.g4g.it/2011/04/07/streets-of-rage-remake-v5-0-final-version/ if the mirror is down."
      )
    ).toBe(true);
    expect(isClientNetworkFailure("Download failed (ENETUNREACH)")).toBe(true);
    expect(isClientNetworkFailure("Download failed (ENETDOWN)")).toBe(true);
  });

  it("still reports failures that are ours or upstream's", () => {
    expect(isClientNetworkFailure("Download failed (HTTP 404)")).toBe(false);
    expect(isClientNetworkFailure("No matching asset for TES3MP/TES3MP tes3mp-0.8.1-vr")).toBe(
      false
    );
    // One host's DNS record going away really is a mirror that died.
    expect(isClientNetworkFailure("Download failed (ENOTFOUND)")).toBe(false);
    expect(isClientNetworkFailure("checksum mismatch")).toBe(false);
  });

  it("never throws on a missing message", () => {
    expect(isClientNetworkFailure(null)).toBe(false);
    expect(isClientNetworkFailure(undefined)).toBe(false);
    expect(isClientNetworkFailure("")).toBe(false);
  });
});
