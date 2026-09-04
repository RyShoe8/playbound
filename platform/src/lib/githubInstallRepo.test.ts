import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GITHUB_INSTALL_KINDS, isGithubInstallKind } from "@/lib/launcherInstall";
import { LAUNCHER_KINDS, withDefaultLauncherInstall, type GamePayload } from "@/lib/gamePayload";

/**
 * Switching Install kind to a github-* one in the admin form saved as 400
 * "GitHub install kinds need owner/repo" while the repo field visibly had a
 * value in it.
 *
 * The field renders `githubRepo` as a fallback but only ever writes
 * `launcherInstall.repo`, so an untouched field displayed one value and sent
 * another. `withDefaultLauncherInstall` coalesces the same way, but it takes a
 * whole GamePayload — and the form's launcher-install-only PATCH sends just
 * `{ launcherInstall }`, so nothing on that path could recover the repo.
 */

const FORM = readFileSync(
  path.join(process.cwd(), "src", "components", "admin", "GameEditorForm.tsx"),
  "utf8"
);

describe("github install kinds", () => {
  it("recognises exactly the kinds that resolve from a GitHub release", () => {
    expect([...GITHUB_INSTALL_KINDS]).toEqual(["github-zip", "github-installer", "github-jar"]);
    for (const kind of GITHUB_INSTALL_KINDS) expect(isGithubInstallKind(kind)).toBe(true);
  });

  it("does not claim kinds that resolve their download elsewhere", () => {
    for (const kind of ["direct-zip", "direct-installer", "steamcmd", "itch-zip", "external"]) {
      expect(isGithubInstallKind(kind)).toBe(false);
    }
  });

  it("survives the values a half-filled form actually holds", () => {
    for (const kind of [undefined, null, "", "GITHUB-ZIP"]) {
      expect(isGithubInstallKind(kind)).toBe(false);
    }
  });

  it("every github-* kind in the catalog union is covered", () => {
    const fromUnion = LAUNCHER_KINDS.filter((k) => k.startsWith("github-"));
    expect([...fromUnion].sort()).toEqual([...GITHUB_INSTALL_KINDS].sort());
  });
});

describe("the editor form commits the repo it is displaying", () => {
  it("seeds launcherInstall.repo from githubRepo when the kind becomes github-*", () => {
    // The fix itself. Asserted against source because the branch lives inside
    // patchLauncher's setForm updater, which has no seam to call directly.
    expect(FORM).toMatch(
      /isGithubInstallKind\(merged\.kind\) && !merged\.repo && prev\.githubRepo/
    );
    expect(FORM).toMatch(/merged\.repo = prev\.githubRepo;/);
  });

  it("the repo input still falls back to githubRepo for display", () => {
    // If this fallback goes away the seeding above is pointless — but so is the
    // bug, so the two must be changed together, deliberately.
    expect(FORM).toMatch(/form\.launcherInstall\?\.repo \?\? form\.githubRepo/);
  });

  it("no longhand copy of the kind check is left to drift", () => {
    expect(FORM).not.toMatch(/kind === "github-installer"/);
  });
});

describe("withDefaultLauncherInstall", () => {
  // platforms + launchMethods matter: withDefaultLauncherInstall only reaches
  // the coalesce for a PC install candidate, and returns early otherwise.
  const base = {
    slug: "x",
    title: "X",
    website: "https://example.com",
    githubRepo: "owner/repo",
    platforms: ["Windows"],
    launchMethods: ["install"],
    browserPlayable: false,
  } as unknown as GamePayload;

  it("still fills a missing repo from githubRepo on a full payload", () => {
    const out = withDefaultLauncherInstall({
      ...base,
      launcherInstall: { enabled: true, kind: "github-zip", repo: null },
    } as unknown as GamePayload);
    expect(out.launcherInstall?.repo).toBe("owner/repo");
  });

  it("does not overwrite a repo the recipe already names", () => {
    const out = withDefaultLauncherInstall({
      ...base,
      launcherInstall: { enabled: true, kind: "github-zip", repo: "someone/else" },
    } as unknown as GamePayload);
    expect(out.launcherInstall?.repo).toBe("someone/else");
  });

  it("leaves non-GitHub kinds alone", () => {
    const out = withDefaultLauncherInstall({
      ...base,
      launcherInstall: { enabled: true, kind: "direct-zip", repo: null },
    } as unknown as GamePayload);
    expect(out.launcherInstall?.repo ?? null).toBeNull();
  });
});
