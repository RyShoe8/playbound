/**
 * Resolves install recipes against their real upstreams.
 *
 * Every one-click install on PlayBound points at somewhere we do not control:
 * a GitHub release, a project's download server, a SourceForge file. Those move.
 * Releases retag, assets get renamed, projects change their default branch, and
 * hosts go away — and nothing about our own deploy notices, because the recipe
 * is still perfectly valid JSON. The user finds out instead.
 *
 * This module is the "does it still work" half; scripts/check-recipe-health.ts
 * runs it over the whole catalog on a schedule and writes the results to
 * recipeHealth.json, which the site reads to decide whether to show a one-click
 * button and how fresh the last check was.
 *
 * Deliberately free of database and Next.js imports so it can run in CI.
 */

export type RecipeStatus = "ok" | "broken" | "skipped";

export interface RecipeCheck {
  /** Stable id, e.g. "game:openra" or "edition:holocure/playbound". */
  id: string;
  kind: string;
  status: RecipeStatus;
  /** What resolved, e.g. the chosen asset name — useful when diagnosing drift. */
  resolved?: string;
  /** Why it failed or was skipped. Present unless status is "ok". */
  detail?: string;
}

/**
 * The launcher's own user-agent, not a checker-specific one.
 *
 * The question this module answers is "would the launcher get this file?", so
 * it has to look like the launcher. A distinct UA is a different question and
 * gets different answers: GitLab served 406 to "playbound-recipe-health" while
 * happily serving the same file to "playbound-launcher", which reported a
 * perfectly working mod as broken.
 */
const UA = "playbound-launcher";

type GhOutcome<T> =
  | { state: "found"; value: T }
  | { state: "missing" }
  /**
   * Unknown, not failing. Anonymous GitHub allows 60 requests an hour and the
   * catalog is well past that, so without this a scheduled run would report
   * most of the catalog as broken the moment it got throttled — which is
   * exactly the false alarm that makes people stop trusting a health check.
   */
  | { state: "unknown"; detail: string };

async function github<T>(
  path: string,
  fetchImpl: typeof fetch,
  { anonymous = false }: { anonymous?: boolean } = {}
): Promise<GhOutcome<T>> {
  const token = anonymous ? null : process.env.GITHUB_TOKEN;
  try {
    const res = await fetchImpl(`https://api.github.com${path}`, {
      headers: {
        "user-agent": UA,
        accept: "application/vnd.github+json",
        // Lifts the anonymous limit. CI supplies the built-in GITHUB_TOKEN.
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) return { state: "found", value: (await res.json()) as T };
    /*
     * A stale token is worse than no token: it turns every GitHub lookup into
     * a 401 and the whole catalog gets reported as unknown, so the run appears
     * to succeed while checking nothing. Drop it and try again anonymously.
     */
    if (res.status === 401 && token) {
      return github<T>(path, fetchImpl, { anonymous: true });
    }
    if (res.status === 404) return { state: "missing" };
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      return {
        state: "unknown",
        detail: remaining === "0" ? "GitHub rate limit reached" : `GitHub ${res.status}`,
      };
    }
    return { state: "unknown", detail: `GitHub ${res.status}` };
  } catch (err) {
    return { state: "unknown", detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Whether a URL serves something.
 *
 * HEAD first because these are often hundreds of megabytes, falling back to a
 * one-byte ranged GET: plenty of download hosts (SourceForge among them) reject
 * or mishandle HEAD while serving GET perfectly well, and treating that as a
 * broken recipe would be a false alarm on a working install.
 */
/** Attempts for connection-level failures, which are usually transient. */
const NETWORK_ATTEMPTS = 3;

async function attemptUrl(
  url: string,
  fetchImpl: typeof fetch
): Promise<{ ok: boolean; retryable?: boolean; detail?: string; threw?: boolean }> {
  try {
    const head = await fetchImpl(url, { method: "HEAD", headers: { "user-agent": UA } });
    if (head.ok) return { ok: true };
    const ranged = await fetchImpl(url, {
      method: "GET",
      headers: { "user-agent": UA, range: "bytes=0-0" },
    });
    if (ranged.ok) return { ok: true };
    /*
     * 429 and 5xx mean "ask again later", not "this is gone". Calling them
     * broken would pull a working game's install button over someone else's
     * bad afternoon, so they are reported as unknown instead.
     */
    const retryable = ranged.status === 429 || ranged.status >= 500;
    return { ok: false, retryable, detail: `HTTP ${ranged.status}` };
  } catch (err) {
    return { ok: false, threw: true, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Whether a URL serves something.
 *
 * HEAD first because these are often hundreds of megabytes, falling back to a
 * one-byte ranged GET: plenty of download hosts (SourceForge among them) reject
 * or mishandle HEAD while serving GET perfectly well.
 *
 * Connection-level failures are retried rather than believed. A single dropped
 * connection is far more often our network or the host briefly throttling a
 * scripted client than a dead download, and treating the first blip as fact
 * would flag live games as broken — Freeciv did exactly that on one run and
 * passed on the next. Only a host that refuses repeatedly is called broken.
 */
export async function checkUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
  { attempts = NETWORK_ATTEMPTS, delayMs = 400 } = {}
): Promise<{ ok: boolean; retryable?: boolean; detail?: string }> {
  let last = await attemptUrl(url, fetchImpl);
  for (let i = 1; i < attempts && !last.ok && last.threw; i++) {
    await new Promise((r) => setTimeout(r, delayMs * i));
    last = await attemptUrl(url, fetchImpl);
  }
  const { threw, ...result } = last;
  void threw;
  return result;
}

/** A recipe in the shape this module needs, from any of our sources. */
export interface CheckableRecipe {
  id: string;
  kind?: string | null;
  repo?: string | null;
  assetPattern?: string | null;
  url?: string | null;
  /** Extra URLs the recipe depends on (addons, overlays, mod-loader payloads). */
  extraUrls?: string[];
  /**
   * Whether a missing release or unmatched asset still yields a usable install.
   *
   * The launcher treats games and mods differently and this check has to match
   * or it reports fiction. resolveDownload() throws outright when a game's
   * release or asset is missing, while resolveModDownload() falls back to the
   * default branch's source archive — so for mods only a genuinely absent
   * repository is a failure.
   */
  sourceArchiveFallback?: boolean;
}

/**
 * Resolve one recipe the way the launcher would.
 *
 * Mirrors pickGithubAsset: case-insensitive regex over asset names. A release
 * that exists but no longer carries a matching asset is the most common and
 * least visible failure — the recipe looks fine and the install dies at
 * download time — so it is reported as broken rather than skipped.
 */
export async function checkRecipe(
  recipe: CheckableRecipe,
  fetchImpl: typeof fetch = fetch
): Promise<RecipeCheck> {
  const kind = String(recipe.kind ?? "");
  const base = { id: recipe.id, kind };

  if (!kind) {
    return { ...base, status: "broken", detail: "recipe has no install kind" };
  }

  // Hand-offs to a storefront or website: nothing for us to resolve, but the
  // page still has to exist.
  if (kind === "external") {
    if (!recipe.url) return { ...base, status: "broken", detail: "external recipe has no url" };
    const res = await checkUrl(recipe.url, fetchImpl);
    if (res.ok) return { ...base, status: "ok", resolved: recipe.url };
    return {
      ...base,
      status: res.retryable ? "skipped" : "broken",
      detail: `${recipe.url} — ${res.detail}`,
    };
  }

  if (kind.startsWith("github-")) {
    if (!recipe.repo) return { ...base, status: "broken", detail: "github recipe has no repo" };
    const fallback = recipe.sourceArchiveFallback === true;

    const release = await github<{ tag_name?: string; assets?: { name?: string }[] }>(
      `/repos/${recipe.repo}/releases/latest`,
      fetchImpl
    );

    if (release.state === "unknown") {
      return { ...base, status: "skipped", detail: `${recipe.repo}: ${release.detail}` };
    }

    if (release.state === "found") {
      const assets = (release.value.assets ?? [])
        .map((a) => String(a?.name ?? ""))
        .filter(Boolean);
      const tag = String(release.value.tag_name ?? "") || "(untagged)";
      const pattern = new RegExp(recipe.assetPattern || ".*", "i");
      const match = assets.find((name) => pattern.test(name));
      if (match) return { ...base, status: "ok", resolved: `${tag} → ${match}` };
      if (!fallback) {
        return {
          ...base,
          status: "broken",
          detail:
            `release ${tag} has no asset matching /${recipe.assetPattern}/ — ` +
            `offers: ${assets.slice(0, 6).join(", ") || "(none)"}`,
        };
      }
    } else if (!fallback) {
      return { ...base, status: "broken", detail: `${recipe.repo} has no published release` };
    }

    // Falling back the way resolveModDownload does: the source archive only
    // needs the repository itself to exist.
    const repoInfo = await github<{ default_branch?: string }>(`/repos/${recipe.repo}`, fetchImpl);
    if (repoInfo.state === "unknown") {
      return { ...base, status: "skipped", detail: `${recipe.repo}: ${repoInfo.detail}` };
    }
    if (repoInfo.state === "missing") {
      return { ...base, status: "broken", detail: `repository ${recipe.repo} does not exist` };
    }
    return {
      ...base,
      status: "ok",
      resolved: `source archive (${repoInfo.value.default_branch || "default branch"})`,
    };
  }

  // direct-zip / direct-exe / direct-installer / locate-then-zip …
  if (!recipe.url) {
    return { ...base, status: "skipped", detail: `no url on a "${kind}" recipe` };
  }
  const res = await checkUrl(recipe.url, fetchImpl);
  if (!res.ok) {
    return {
      ...base,
      status: res.retryable ? "skipped" : "broken",
      detail: `${recipe.url} — ${res.detail}`,
    };
  }

  for (const extra of recipe.extraUrls ?? []) {
    const extraRes = await checkUrl(extra, fetchImpl);
    if (!extraRes.ok) {
      return {
        ...base,
        status: extraRes.retryable ? "skipped" : "broken",
        detail: `dependency ${extra} — ${extraRes.detail}`,
      };
    }
  }

  return { ...base, status: "ok", resolved: recipe.url };
}

/** Summary shape written to recipeHealth.json and read by the site. */
export interface HealthReport {
  checkedAt: string;
  ok: number;
  broken: number;
  skipped: number;
  /** Only failures are stored — the site treats "absent" as healthy. */
  failures: { id: string; kind: string; detail: string }[];
}

export function summarize(checks: RecipeCheck[], now = new Date()): HealthReport {
  return {
    checkedAt: now.toISOString(),
    ok: checks.filter((c) => c.status === "ok").length,
    broken: checks.filter((c) => c.status === "broken").length,
    skipped: checks.filter((c) => c.status === "skipped").length,
    failures: checks
      .filter((c) => c.status === "broken")
      .map((c) => ({ id: c.id, kind: c.kind, detail: c.detail ?? "unknown" })),
  };
}
