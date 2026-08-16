/*
 * deepLinks.js — parser tests.
 *
 * Deep links are reachable by any web page, so these cases are as much about
 * what must NOT come back as what must. Run with: npm run test:deeplinks
 */
const { createDeepLinks, SLUG_ACTIONS } = require("./deepLinks");

const { parseDeepLink, extractLinkHandoff } = createDeepLinks("playbound");

const results = [];
const check = (name, cond, extra = "") => results.push({ name, ok: Boolean(cond), extra });
const eq = (name, got, want) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

/* ── the shapes main.js dispatches on ────────────────────────────────── */

eq("install", parseDeepLink("playbound://install/openra"), { action: "install", slug: "openra" });
eq("play", parseDeepLink("playbound://play/warzone-2100"), { action: "play", slug: "warzone-2100" });
eq("uninstall", parseDeepLink("playbound://uninstall/openra"), { action: "uninstall", slug: "openra" });
eq("trailing slash tolerated", parseDeepLink("playbound://install/openra/"), { action: "install", slug: "openra" });
eq("install-mod", parseDeepLink("playbound://install-mod/cool-mod"), { action: "install-mod", slug: "cool-mod" });
eq("play-mod", parseDeepLink("playbound://play-mod/openra-tiberian-dawn-hd"), {
  action: "play-mod",
  slug: "openra-tiberian-dawn-hd",
});
eq("open-folder", parseDeepLink("playbound://open-folder/openra"), { action: "open-folder", slug: "openra" });
eq("open-folder-mod", parseDeepLink("playbound://open-folder-mod/cool-mod"), {
  action: "open-folder-mod",
  slug: "cool-mod",
});
eq("uninstall-mod", parseDeepLink("playbound://uninstall-mod/cool-mod"), {
  action: "uninstall-mod",
  slug: "cool-mod",
});
eq("locate", parseDeepLink("playbound://locate/naev"), { action: "locate", slug: "naev" });
eq("auth", parseDeepLink("playbound://auth"), { action: "auth" });
eq("sync", parseDeepLink("playbound://sync"), { action: "sync" });
eq("join carries host/port/name", parseDeepLink("playbound://join/openra?host=1.2.3.4&port=1234&name=Test"), {
  action: "join",
  slug: "openra",
  host: "1.2.3.4",
  port: 1234,
  name: "Test",
});
eq("edition is carried on install", parseDeepLink("playbound://install/holocure?edition=multiplayer"), {
  action: "install",
  slug: "holocure",
  editionSlug: "multiplayer",
});

/* ── ?mod= list on install ────────────────────────────────────────────── */

eq(
  "mods are carried on install",
  parseDeepLink("playbound://install/openra?edition=ra&mod=alpha&mod=beta"),
  { action: "install", slug: "openra", editionSlug: "ra", modSlugs: ["alpha", "beta"] }
);
eq("a single mod parses", parseDeepLink("playbound://install/openra?mod=alpha"), {
  action: "install",
  slug: "openra",
  modSlugs: ["alpha"],
});
eq("no mod param yields no modSlugs field", parseDeepLink("playbound://install/openra"), {
  action: "install",
  slug: "openra",
});
eq("mods are lowercased", parseDeepLink("playbound://install/openra?mod=Alpha"), {
  action: "install",
  slug: "openra",
  modSlugs: ["alpha"],
});
eq("duplicate mods collapse", parseDeepLink("playbound://install/openra?mod=a&mod=a&mod=b"), {
  action: "install",
  slug: "openra",
  modSlugs: ["a", "b"],
});
// The whole point of validating: these become paths and URLs downstream.
eq(
  "a traversal mod slug is dropped, the good one survives",
  parseDeepLink("playbound://install/openra?mod=../../etc/passwd&mod=good"),
  { action: "install", slug: "openra", modSlugs: ["good"] }
);
eq(
  "a mod slug with a separator is dropped",
  parseDeepLink("playbound://install/openra?mod=a/b"),
  { action: "install", slug: "openra" }
);
eq(
  "an absolute-path mod slug is dropped",
  parseDeepLink("playbound://install/openra?mod=%2Fetc%2Fpasswd"),
  { action: "install", slug: "openra" }
);
eq(
  "mods are not attached to actions that do not take them",
  parseDeepLink("playbound://play/openra?mod=alpha"),
  { action: "play", slug: "openra" }
);

{
  const many = Array.from({ length: 40 }, (_, i) => `mod=m${i}`).join("&");
  const parsed = parseDeepLink(`playbound://install/openra?${many}`);
  check(
    "the mod list is capped at 25",
    Array.isArray(parsed.modSlugs) && parsed.modSlugs.length === 25
  );
}

/* ── credentials must never survive parsing ──────────────────────────── */

{
  const viaToken = parseDeepLink("playbound://link?token=attacker-bearer");
  check("legacy ?token= yields no token field", viaToken && !("token" in viaToken), JSON.stringify(viaToken));
  check("legacy ?token= yields an empty code", viaToken && viaToken.code === "");
  check("a token-only link is not a handoff", extractLinkHandoff("playbound://link?token=attacker-bearer") === null);

  const both = parseDeepLink("playbound://link?code=good&token=attacker-bearer");
  eq("code wins and token is dropped", both, { action: "link", code: "good" });

  eq("a real handoff is returned", extractLinkHandoff("playbound://link?code=abc"), { action: "link", code: "abc" });
  check("an empty code is not a handoff", extractLinkHandoff("playbound://link?code=") === null);
  check("a non-link action is not a handoff", extractLinkHandoff("playbound://install/openra") === null);
}

/* ── rejections ──────────────────────────────────────────────────────── */

for (const [name, url] of [
  ["not a deep link", "not-a-deep-link"],
  ["empty string", ""],
  ["unknown action", "playbound://frobnicate/openra"],
  ["slug action with no slug", "playbound://install"],
  ["slug action with empty slug", "playbound://install/"],
  ["another app's scheme", "steam://install/1234"],
]) {
  check(`rejects: ${name}`, parseDeepLink(url) === null, JSON.stringify(parseDeepLink(url)));
}

/* ── details worth pinning ───────────────────────────────────────────── */

check("action matching is case-insensitive", parseDeepLink("PLAYBOUND://INSTALL/OpenRA")?.action === "install");
check("slug is lowercased", parseDeepLink("playbound://install/OpenRA")?.slug === "openra");
check(
  "a non-numeric join port becomes 0 rather than NaN",
  parseDeepLink("playbound://join/openra?host=h&port=abc&name=n")?.port === 0
);
check(
  "edition is not attached to actions that do not take one",
  !("editionSlug" in (parseDeepLink("playbound://locate/naev?edition=x") || {}))
);
check("every slug action parses", SLUG_ACTIONS.every((a) => parseDeepLink(`playbound://${a}/some-slug`)?.action === a));

// A path with extra segments still resolves to a single slug string rather than
// silently addressing something unintended.
check(
  "multi-segment paths do not produce a slug with separators",
  !String(parseDeepLink("playbound://install/a/b")?.slug ?? "").includes("/") ||
    parseDeepLink("playbound://install/a/b") === null,
  JSON.stringify(parseDeepLink("playbound://install/a/b"))
);

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.name}${r.ok || !r.extra ? "" : `  [${r.extra}]`}`);
}
console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} of ${results.length} FAILED.`);
process.exit(failed === 0 ? 0 : 1);
