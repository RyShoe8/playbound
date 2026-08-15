import { describe, it, expect } from "vitest";
import { checkRecipe, summarize } from "./check";

/** Minimal fetch stub: maps a URL substring to a canned response. */
function stubFetch(routes: Record<string, { status: number; body?: unknown; headers?: Record<string, string> }>) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key] : { status: 404 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (h: string) => r.headers?.[h.toLowerCase()] ?? null },
      json: async () => r.body ?? {},
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const release = (tag: string, assets: string[]) => ({
  tag_name: tag,
  assets: assets.map((name) => ({ name })),
});

describe("recipe health checks", () => {
  it("passes a github recipe whose pattern matches a real asset", async () => {
    const fetchImpl = stubFetch({
      "/releases/latest": { status: 200, body: release("v1.2.3", ["Game-win64.zip", "Game.apk"]) },
    });
    const r = await checkRecipe(
      { id: "game:x", kind: "github-zip", repo: "a/b", assetPattern: "win64\\.zip$" },
      fetchImpl
    );
    expect(r.status).toBe("ok");
    expect(r.resolved).toContain("Game-win64.zip");
  });

  it("fails a game whose release no longer carries a matching asset", async () => {
    // resolveDownload() throws in this case, so the install really is broken.
    const fetchImpl = stubFetch({
      "/releases/latest": { status: 200, body: release("v2", ["Game-linux.tar.gz"]) },
    });
    const r = await checkRecipe(
      { id: "game:x", kind: "github-zip", repo: "a/b", assetPattern: "win64\\.zip$" },
      fetchImpl
    );
    expect(r.status).toBe("broken");
    expect(r.detail).toContain("no asset matching");
  });

  it("passes a mod with no matching asset, because mods fall back to source", async () => {
    // resolveModDownload() falls back to the default-branch archive, so this
    // still installs — reporting it broken would be a false alarm.
    const fetchImpl = stubFetch({
      "/releases/latest": { status: 200, body: release("v2", ["something-else.7z"]) },
      "/repos/a/b": { status: 200, body: { default_branch: "main" } },
    });
    const r = await checkRecipe(
      {
        id: "mod:x",
        kind: "github-zip",
        repo: "a/b",
        assetPattern: "win64\\.zip$",
        sourceArchiveFallback: true,
      },
      fetchImpl
    );
    expect(r.status).toBe("ok");
    expect(r.resolved).toContain("source archive");
  });

  it("fails a mod whose repository does not exist at all", async () => {
    const fetchImpl = stubFetch({}); // everything 404s
    const r = await checkRecipe(
      { id: "mod:x", kind: "github-zip", repo: "ghost/repo", sourceArchiveFallback: true },
      fetchImpl
    );
    expect(r.status).toBe("broken");
    expect(r.detail).toContain("does not exist");
  });

  it("never reports broken when GitHub is rate limiting", async () => {
    // The single most important behaviour here: a throttled run must not
    // declare the catalog broken.
    const fetchImpl = stubFetch({
      "/releases/latest": { status: 403, headers: { "x-ratelimit-remaining": "0" } },
    });
    const r = await checkRecipe(
      { id: "mod:x", kind: "github-zip", repo: "a/b", sourceArchiveFallback: true },
      fetchImpl
    );
    expect(r.status).toBe("skipped");
    expect(r.detail).toContain("rate limit");
  });

  it("treats a recipe with no install kind as broken", async () => {
    // This is exactly the state the HoloCure edition shipped in: valid data,
    // no kind, nothing installable.
    const r = await checkRecipe({ id: "edition:a/b", url: "https://example.com" }, stubFetch({}));
    expect(r.status).toBe("broken");
    expect(r.detail).toContain("no install kind");
  });

  it("accepts a direct download that serves only ranged GET", async () => {
    // SourceForge and friends reject HEAD but serve the file fine.
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      return {
        ok: method === "GET",
        status: method === "GET" ? 206 : 405,
        headers: { get: () => null },
        json: async () => ({}),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await checkRecipe(
      { id: "game:x", kind: "direct-zip", url: "https://sourceforge.net/thing.zip" },
      fetchImpl
    );
    expect(r.status).toBe("ok");
  });

  it("fails when a dependency URL is dead even though the main one works", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const ok = String(input).includes("good");
      return {
        ok,
        status: ok ? 200 : 404,
        headers: { get: () => null },
        json: async () => ({}),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await checkRecipe(
      {
        id: "edition:a/b",
        kind: "direct-zip",
        url: "https://good.example/base.zip",
        extraUrls: ["https://dead.example/loader.dll"],
      },
      fetchImpl
    );
    expect(r.status).toBe("broken");
    expect(r.detail).toContain("dependency");
  });

  it("treats a rate-limited host as unknown rather than broken", async () => {
    // 429 is "ask later". Pulling a working game's install button because a
    // download host throttled our checker would be self-inflicted damage.
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: async () => ({}),
      }) as unknown as Response) as unknown as typeof fetch;

    const r = await checkRecipe(
      { id: "game:x", kind: "direct-zip", url: "https://busy.example/g.zip" },
      fetchImpl
    );
    expect(r.status).toBe("skipped");
  });

  it("falls back to anonymous GitHub when the token is rejected", async () => {
    // A stale token 401s every call, which would silently blank the entire run.
    process.env.GITHUB_TOKEN = "stale-token";
    let sawAuthedCall = false;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers.authorization) {
        sawAuthedCall = true;
        return { ok: false, status: 401, headers: { get: () => null }, json: async () => ({}) } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => release("v9", ["Game-win64.zip"]),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const r = await checkRecipe(
      { id: "game:x", kind: "github-zip", repo: "a/b", assetPattern: "win64\\.zip$" },
      fetchImpl
    );
    delete process.env.GITHUB_TOKEN;
    expect(sawAuthedCall).toBe(true);
    expect(r.status).toBe("ok");
  });

  it("summarizes only failures, so a healthy catalog stores nothing", () => {
    const report = summarize([
      { id: "a", kind: "github-zip", status: "ok" },
      { id: "b", kind: "direct-zip", status: "broken", detail: "gone" },
      { id: "c", kind: "github-zip", status: "skipped", detail: "rate limit" },
    ]);
    expect(report.ok).toBe(1);
    expect(report.broken).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.failures).toEqual([{ id: "b", kind: "direct-zip", detail: "gone" }]);
  });
});
