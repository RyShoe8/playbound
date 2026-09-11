import { describe, it, expect } from "vitest";
import {
  isClientNetworkFailure,
  buildAutoBugDescription,
  pushMessageSample,
  autoBugFingerprint,
} from "./autoBugReport";

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

describe("auto bug description intelligence", () => {
  it("includes structured install and OpenMW fields", () => {
    const description = buildAutoBugDescription(
      {
        event: "install_failed",
        source: "launcher",
        code: "ASSET_NOT_FOUND",
        phase: "install",
        gameSlug: "morrowind",
        editionSlug: "openmw",
        gameTitle: "Morrowind",
        osVersion: "10.0.19045",
        architecture: "x64",
        repo: "OpenMW/openmw",
        assetPattern: "openmw-.*-win64\\.zip$",
        version: "openmw-0.51.0",
        httpStatus: null,
      },
      "No matching asset for OpenMW/openmw openmw-0.51.0"
    );
    expect(description).toContain("Edition: openmw");
    expect(description).toContain("Repo: OpenMW/openmw");
    expect(description).toContain("Asset pattern: openmw-.*-win64\\.zip$");
    expect(description).toContain("Version: openmw-0.51.0");
    expect(description).toContain("OS: 10.0.19045");
    expect(description).toContain("Arch: x64");
    expect(description).toContain("No matching asset for OpenMW/openmw openmw-0.51.0");
  });

  it("includes launch stderr and Morrowind data flags", () => {
    const description = buildAutoBugDescription(
      {
        event: "launch_failed",
        source: "launcher",
        code: "MORROWIND_DATA_MISSING",
        phase: "spawn",
        gameSlug: "morrowind",
        editionSlug: "tes3mp",
        exeBasename: "tes3mp.exe",
        exitCode: 1,
        morrowindDataFound: false,
        openmwCfgWritten: false,
        stderrTail: "No content file given (esm/esp). Aborting...",
      },
      "needs Morrowind game data"
    );
    expect(description).toContain("Exe: tes3mp.exe");
    expect(description).toContain("Exit code: 1");
    expect(description).toContain("Morrowind data found: false");
    expect(description).toContain("openmw.cfg written: false");
    expect(description).toContain("No content file given");
  });

  it("keeps distinct message samples newest-last and capped", () => {
    expect(pushMessageSample([], "a")).toEqual(["a"]);
    expect(pushMessageSample(["a"], "a")).toEqual(["a"]);
    expect(pushMessageSample(["a"], "b")).toEqual(["a", "b"]);
    expect(pushMessageSample(["a", "b", "c", "d", "e"], "f")).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("fingerprints still include message hash", () => {
    const a = autoBugFingerprint({
      event: "launch_failed",
      source: "launcher",
      code: "EARLY_EXIT",
      gameSlug: "morrowind",
      editionSlug: "tes3mp",
      message: "one",
    });
    const b = autoBugFingerprint({
      event: "launch_failed",
      source: "launcher",
      code: "EARLY_EXIT",
      gameSlug: "morrowind",
      editionSlug: "tes3mp",
      message: "two",
    });
    expect(a).not.toEqual(b);
  });
});
