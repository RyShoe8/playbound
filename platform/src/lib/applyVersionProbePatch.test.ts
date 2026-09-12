import { describe, expect, it } from "vitest";
import { editionProbePatchFields, modProbePatchFields } from "./applyVersionProbePatch";

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

describe("modProbePatchFields", () => {
  it("applies updated githubRepo and website on auto-heal", () => {
    expect(
      modProbePatchFields(
        { downloadKind: "github-zip", autoUpdatePinned: true },
        {
          status: "updated",
          detectedVersion: "master",
          note: "auto-healed: updated GitHub repo to JasonP01/AllureMod",
          patch: {
            directUrl: "https://github.com/JasonP01/AllureMod/archive/refs/heads/master.zip",
            githubRepo: "JasonP01/AllureMod",
            website: "https://github.com/JasonP01/AllureMod",
          },
        }
      )
    ).toEqual({
      directUrl: "https://github.com/JasonP01/AllureMod/archive/refs/heads/master.zip",
      githubRepo: "JasonP01/AllureMod",
      website: "https://github.com/JasonP01/AllureMod",
    });
  });

  it("does not apply repo patches when not healing", () => {
    expect(
      modProbePatchFields(
        { downloadKind: "github-zip", autoUpdatePinned: true },
        {
          status: "updated",
          detectedVersion: "1.0",
          note: "regular update",
          patch: {
            githubRepo: "some/other",
          },
        }
      )
    ).toEqual({});
  });
});
