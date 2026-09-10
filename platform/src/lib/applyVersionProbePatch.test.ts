import { describe, expect, it } from "vitest";
import { editionProbePatchFields } from "./applyVersionProbePatch";

describe("editionProbePatchFields", () => {
  it("updates a direct edition's pinned GitHub asset and version", () => {
    expect(
      editionProbePatchFields(
        { kind: "direct-zip" },
        {
          status: "updated",
          detectedVersion: "0.5.5",
          patch: {
            url: "https://github.com/OpenRCT2/OpenRCT2/releases/download/v0.5.5/OpenRCT2.zip",
            fileName: "OpenRCT2.zip",
            versionLabel: "0.5.5",
          },
        }
      )
    ).toEqual({
      "installConfig.playbound_installer.url":
        "https://github.com/OpenRCT2/OpenRCT2/releases/download/v0.5.5/OpenRCT2.zip",
      "installConfig.playbound_installer.fileName": "OpenRCT2.zip",
      "installConfig.playbound_installer.versionLabel": "0.5.5",
    });
  });

  it("does not rewrite a healthy edition", () => {
    expect(
      editionProbePatchFields(
        { kind: "direct-zip" },
        { status: "ok", detectedVersion: "0.5.4" }
      )
    ).toEqual({});
  });
});
