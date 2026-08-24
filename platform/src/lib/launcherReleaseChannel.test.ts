import { describe, it, expect } from "vitest";
import { resolveReleaseChannel, type BuildEvidence } from "./launcherReleaseChannel";

const win = (over: Partial<BuildEvidence> = {}): BuildEvidence => ({
  hasAdminYml: false,
  hasProdYml: false,
  platform: "windows",
  ...over,
});

describe("the default", () => {
  it("is the admin channel when nothing asks otherwise", () => {
    const d = resolveReleaseChannel([], win({ hasProdYml: true }));
    expect(d.channel).toBe("admin");
    expect(d.explicit).toBe(false);
    expect(d.refuse).toBeUndefined();
  });

  it("reports whether a channel was actually asked for", () => {
    expect(resolveReleaseChannel(["--admin"], win()).explicit).toBe(true);
    expect(resolveReleaseChannel([], win()).explicit).toBe(false);
  });
});

describe("the hole this replaces", () => {
  it("does not treat missing metadata as a signed build", () => {
    /*
     * The old rule was `isAdmin = existsSync(admin.yml)`, so an installer with
     * no metadata beside it — copied out of a downloads folder on its own —
     * resolved to production, overwrote the public installer, and skipped the
     * unsigned guard because that guard was gated on the same inference.
     */
    const d = resolveReleaseChannel(["--prod"], win({ hasAdminYml: false, hasProdYml: false }));
    expect(d.refuse).toBeTruthy();
    expect(d.refuse).toMatch(/without update metadata/i);
  });

  it("still defaults that same build to the harmless channel", () => {
    // Absent any flag, the metadata-less installer goes to admin, not prod.
    expect(resolveReleaseChannel([], win()).channel).toBe("admin");
  });
});

describe("publishing to the public channel", () => {
  it("refuses an unsigned Windows build", () => {
    const d = resolveReleaseChannel(["--prod"], win({ hasAdminYml: true }));
    expect(d.refuse).toMatch(/UNSIGNED/);
  });

  it("allows a signed one", () => {
    const d = resolveReleaseChannel(["--prod"], win({ hasProdYml: true }));
    expect(d.channel).toBe("prod");
    expect(d.refuse).toBeUndefined();
  });

  it("takes the override, since sometimes you do mean it", () => {
    for (const ev of [win({ hasAdminYml: true }), win()]) {
      const d = resolveReleaseChannel(["--prod", "--i-know-its-unsigned"], ev);
      expect(d.channel).toBe("prod");
      expect(d.refuse).toBeUndefined();
    }
  });

  it("does not gate mac or linux, which never sign through this path", () => {
    for (const platform of ["macos", "linux"] as const) {
      const d = resolveReleaseChannel(["--prod"], { hasAdminYml: true, hasProdYml: false, platform });
      expect(d.channel).toBe("prod");
      expect(d.refuse).toBeUndefined();
    }
  });

  it("keeps accepting the old --promote-prod spelling", () => {
    // Muscle memory and the existing docs both use it.
    const d = resolveReleaseChannel(["--promote-prod"], win({ hasProdYml: true }));
    expect(d.channel).toBe("prod");
  });
});

describe("contradictory flags", () => {
  it("refuses rather than silently picking one", () => {
    const d = resolveReleaseChannel(["--admin", "--prod"], win({ hasProdYml: true }));
    expect(d.refuse).toMatch(/Pick one/);
    // And if a caller ignored the refusal, the value it carries is the safe one.
    expect(d.channel).toBe("admin");
  });
});

describe("no argument combination reaches production by accident", () => {
  it("only ever returns prod when a prod flag was passed", () => {
    const argSets = [
      [], ["--admin"], ["--mac"], ["--linux"], ["--i-know-its-unsigned"],
      ["some/path/PlayBound-Setup-0.2.64.exe"],
    ];
    const evidences = [
      win(), win({ hasAdminYml: true }), win({ hasProdYml: true }),
      win({ hasAdminYml: true, hasProdYml: true }),
    ];
    for (const args of argSets) {
      for (const ev of evidences) {
        expect(resolveReleaseChannel(args, ev).channel, `${JSON.stringify(args)}`).toBe("admin");
      }
    }
  });
});
