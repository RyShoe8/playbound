import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMobileOutbound, parseMobileOs, type MobilePlayGame } from "./mobilePlay";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function game(overrides: Partial<MobilePlayGame> = {}): MobilePlayGame {
  return {
    website: "https://example.com",
    browserPlayable: false,
    launchMethods: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseMobileOs
// ---------------------------------------------------------------------------

describe("parseMobileOs", () => {
  it("detects Android", () => {
    expect(
      parseMobileOs(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      )
    ).toBe("android");
  });

  it("detects iOS (iPhone)", () => {
    expect(
      parseMobileOs(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios");
  });

  it("detects iOS (iPad)", () => {
    expect(
      parseMobileOs(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios");
  });

  it('returns "other" for desktop UA', () => {
    expect(
      parseMobileOs(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      )
    ).toBe("other");
  });

  it('returns "other" for null/undefined', () => {
    expect(parseMobileOs(null)).toBe("other");
    expect(parseMobileOs(undefined)).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// resolveMobileOutbound
// ---------------------------------------------------------------------------

describe("resolveMobileOutbound", () => {
  // --- Browser games ---

  it("returns Play Free for browser-playable games regardless of OS", () => {
    const g = game({ browserPlayable: true });
    expect(resolveMobileOutbound(g, "ios").label).toBe("Play Free");
    expect(resolveMobileOutbound(g, "android").label).toBe("Play Free");
    expect(resolveMobileOutbound(g, "other").label).toBe("Play Free");
  });

  // --- Matching OS + matching store URL ---

  it("sends Android users to Google Play when androidStoreUrl is set", () => {
    const g = game({
      androidStoreUrl: "https://play.google.com/store/apps/details?id=com.example",
    });
    const result = resolveMobileOutbound(g, "android");
    expect(result.label).toBe("Get on Google Play");
    expect(result.href).toBe(g.androidStoreUrl);
  });

  it("sends iOS users to the App Store when iosStoreUrl is set", () => {
    const g = game({
      iosStoreUrl: "https://apps.apple.com/app/example/id123456",
    });
    const result = resolveMobileOutbound(g, "ios");
    expect(result.label).toBe("Get on the App Store");
    expect(result.href).toBe(g.iosStoreUrl);
  });

  // --- THE BUG: known OS but only the OTHER store URL is set ---

  it("does NOT send iOS users to Google Play when only androidStoreUrl is set", () => {
    const g = game({
      androidStoreUrl: "https://play.google.com/store/apps/details?id=com.example",
    });
    const result = resolveMobileOutbound(g, "ios");
    // Should fall through to the website, not the wrong store.
    expect(result.label).not.toBe("Get on Google Play");
    expect(result.href).toBe(g.website);
  });

  it("does NOT send Android users to the App Store when only iosStoreUrl is set", () => {
    const g = game({
      iosStoreUrl: "https://apps.apple.com/app/example/id123456",
    });
    const result = resolveMobileOutbound(g, "android");
    // Should fall through to the website, not the wrong store.
    expect(result.label).not.toBe("Get on the App Store");
    expect(result.href).toBe(g.website);
  });

  // --- Unknown OS → ambiguous fallback still works ---

  it("shows Google Play to unknown OS when only androidStoreUrl is set", () => {
    const g = game({
      androidStoreUrl: "https://play.google.com/store/apps/details?id=com.example",
    });
    const result = resolveMobileOutbound(g, "other");
    expect(result.label).toBe("Get on Google Play");
    expect(result.href).toBe(g.androidStoreUrl);
  });

  it("shows App Store to unknown OS when only iosStoreUrl is set", () => {
    const g = game({
      iosStoreUrl: "https://apps.apple.com/app/example/id123456",
    });
    const result = resolveMobileOutbound(g, "other");
    expect(result.label).toBe("Get on the App Store");
    expect(result.href).toBe(g.iosStoreUrl);
  });

  // --- Both stores set, but OS doesn't match either (ambiguous) ---

  it("falls through to website when both stores exist but OS is unknown", () => {
    const g = game({
      androidStoreUrl: "https://play.google.com/store/apps/details?id=com.example",
      iosStoreUrl: "https://apps.apple.com/app/example/id123456",
    });
    const result = resolveMobileOutbound(g, "other");
    /*
     * Both stores are set, so neither single-store fallback triggers and we
     * cannot pick for them — the site is where they choose. Labelled "Open
     * official site" rather than "Get It Free", which on a phone promises an
     * app install and made MobileOutboundCta draw a download icon for games
     * that have no store at all.
     */
    expect(result.label).toBe("Open official site");
    expect(result.href).toBe(g.website);
  });

  // --- No store URLs at all ---

  it("falls through to the website when no store URLs exist", () => {
    const g = game();
    expect(resolveMobileOutbound(g, "android").href).toBe(g.website);
    expect(resolveMobileOutbound(g, "ios").href).toBe(g.website);
    expect(resolveMobileOutbound(g, "other").href).toBe(g.website);
  });
});

describe("no store means no install promise", () => {
  /*
   * Re-Volt is the real case: listed for Android because RVGL has an Android
   * build, but it is not on Google Play. The old fallback said "Get It Free",
   * which on a phone is a promise to install an app — and MobileOutboundCta
   * chooses its icon from the label, so it drew a download arrow for a
   * download that does not exist.
   */
  const noStore = game({
    website: "https://re-volt.io/",
    androidStoreUrl: null,
    iosStoreUrl: null,
    browserPlayable: false,
  });

  it("sends every OS to the official site, not a store", () => {
    for (const os of ["android", "ios", "other"] as const) {
      const result = resolveMobileOutbound(noStore, os);
      expect(result.label, `${os} was offered an install`).toBe("Open official site");
      expect(result.href).toBe("https://re-volt.io/");
    }
  });

  it("never claims a store the game is not on", () => {
    for (const os of ["android", "ios", "other"] as const) {
      const { label } = resolveMobileOutbound(noStore, os);
      expect(label).not.toBe("Get on Google Play");
      expect(label).not.toBe("Get on the App Store");
    }
  });

  it("a browser game still leads with play, not a site link", () => {
    // Browser play is a real thing we can offer, so it outranks the fallback.
    const browser = game({
      website: "https://example.com",
      browserPlayable: true,
      androidStoreUrl: null,
      iosStoreUrl: null,
    });
    expect(resolveMobileOutbound(browser, "android").label).toBe("Play Free");
  });
});

describe("the surrounding copy agrees with the button", () => {
  /*
   * The button was fixed first and the heading above it still read "Get it on
   * this device" — the same promise, one level up. Verified live on Re-Volt
   * under an Android UA before this was written.
   */
  const CTA = readFileSync(
    path.join(process.cwd(), "src", "components", "DeviceAwareInstallCta.tsx"),
    "utf8"
  );

  it("does not say 'get it on this device' when it is only a link out", () => {
    expect(CTA).toMatch(/outbound\.label === "Open official site" \? "Where to get it" : "Get it on this device"/);
  });

  it("explains why there is no install, rather than implying one", () => {
    expect(CTA).toMatch(/No app store listing for this one/);
  });
});
