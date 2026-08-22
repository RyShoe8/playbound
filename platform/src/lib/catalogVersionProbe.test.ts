import { describe, it, expect, vi, afterEach } from "vitest";
import { probeDirectUrl, probeGithubZip } from "./catalogVersionProbe";

/**
 * These encode the failures that made the previous probe untrustworthy: it
 * called throttling and transient network blips "broken", which filled
 * admin/version-issues with healthy games and would now also hide their
 * install buttons.
 */

function response({ ok, status, headers = {}, body = {} }: {
  ok: boolean;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}) {
  return {
    ok,
    status,
    headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probeDirectUrl", () => {
  it("passes a URL that answers HEAD", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: true, status: 200 })));
    expect((await probeDirectUrl("https://x.test/a.zip")).status).toBe("ok");
  });

  it("accepts a host that rejects HEAD but serves a ranged GET", async () => {
    // SourceForge and friends behave exactly this way.
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        return call === 1 ? response({ ok: false, status: 405 }) : response({ ok: true, status: 206 });
      })
    );
    expect((await probeDirectUrl("https://x.test/a.zip")).status).toBe("ok");
  });

  it("retries a dropped connection instead of believing the first blip", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        if (call <= 2) throw new Error("fetch failed");
        return response({ ok: true, status: 200 });
      })
    );
    const r = await probeDirectUrl("https://flaky.test/a.zip");
    expect(r.status).toBe("ok");
    expect(call).toBeGreaterThan(1);
  });

  it("reports broken only when every attempt fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      })
    );
    expect((await probeDirectUrl("https://dead.test/a.zip")).status).toBe("broken");
  });

  it("treats a throttled host as skipped, not broken", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: false, status: 429 })));
    expect((await probeDirectUrl("https://busy.test/a.zip")).status).toBe("skipped");
  });

  it("treats a server error as skipped, not broken", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: false, status: 503 })));
    expect((await probeDirectUrl("https://down.test/a.zip")).status).toBe("skipped");
  });

  it("treats a retired vhost (421) as skipped, not broken", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: false, status: 421 })));
    expect((await probeDirectUrl("https://mrboom.mumble.info/")).status).toBe("skipped");
  });

  it("still reports a genuine 404 as broken", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: false, status: 404 })));
    expect((await probeDirectUrl("https://gone.test/a.zip")).status).toBe("broken");
  });
});

describe("probeGithubZip", () => {
  it("resolves a release asset matching the pattern", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          ok: true,
          status: 200,
          body: {
            tag_name: "v2.0",
            assets: [{ name: "Game-win64.zip", browser_download_url: "https://x.test/g.zip" }],
          },
        })
      )
    );
    const r = await probeGithubZip({ repo: "a/b", assetPattern: "win64\\.zip$" });
    expect(["ok", "updated"]).toContain(r.status);
    expect(r.detectedVersion).toBe("v2.0");
  });

  it("never reports broken when GitHub is rate limiting", async () => {
    // The single most important case: a throttled cron run must not mark the
    // catalog broken and hide working install buttons.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({ ok: false, status: 403, headers: { "x-ratelimit-remaining": "0" } })
      )
    );
    const r = await probeGithubZip({ repo: "a/b", assetPattern: "\\.zip$" });
    expect(r.status).toBe("skipped");
    expect(r.note).toMatch(/rate limit/i);
  });

  it("treats a rejected token as unknown rather than broken", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: false, status: 401 })));
    const r = await probeGithubZip({ repo: "a/b" });
    expect(r.status).toBe("skipped");
  });
});
