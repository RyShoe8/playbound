"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("./vpforumsDownload");

const PAGE = "https://www.vpforums.org/index.php?app=downloads&showfile=16443";
const dl = (id) => `https://www.vpforums.org/index.php?app=downloads&amp;module=display&amp;section=download&amp;do=do_download&amp;hash=h&amp;id=${id}`;
// Shapes copied from the live site (signed in, 2026-11-01).
const filePage =
  '<a href="https://www.vpforums.org/index.php?app=downloads&amp;module=display&amp;section=download&amp;do=version_download&amp;id=9834">old</a>' +
  '<a href="https://www.vpforums.org/index.php?app=downloads&amp;module=display&amp;section=download&amp;do=confirm_download&amp;hash=h">Download</a>';
const confirmPage =
  `<li>5.09MB <a href="${dl(130710)}" class="b">Download</a> <span>&nbsp;&nbsp; Shamrock (Inder 1977) 1p v600.zip</span></li>` +
  `<li>2.85MB <a href="${dl(130713)}">Download</a> &nbsp;&nbsp; Shamrock (Inder 1977) 1P.directb2s.zip</li>` +
  `<li>5.06MB <a href="${dl(130712)}">Download</a> &nbsp;&nbsp; Shamrock (Inder 1977) 4p v600.zip</li>`;

const signedIn = async () => [{ name: "member_id", value: "248238" }, { name: "pass_hash", value: "x" }];

function fakeFetch(seen) {
  return async (url) => {
    seen.push(url);
    const html = url.includes("confirm_download") ? confirmPage : filePage;
    return { ok: true, status: 200, headers: new Map([["content-type", "text/html"]]), text: async () => html };
  };
}

test("recognises VPForums file pages only", () => {
  assert.equal(v.vpforumsFileId(PAGE), "16443");
  assert.equal(v.vpforumsFileId("https://vpforums.org/index.php?app=downloads&showfile=1"), "1");
  assert.equal(v.vpforumsFileId("https://www.vpforums.org/index.php?app=forums&showtopic=1"), null);
  assert.equal(v.vpforumsFileId("https://evil.example/index.php?app=downloads&showfile=1"), null);
});

test("downloads the current version's 4-player table, never an old version or a backglass", async () => {
  const seen = [];
  const out = await v.resolveVpforumsDownload(PAGE, { getCookies: signedIn, fetchImpl: fakeFetch(seen) });
  assert.equal(out.filename, "Shamrock (Inder 1977) 4p v600.zip");
  assert.match(out.url, /do=do_download&hash=h&id=130712$/);
  assert.match(out.headers.cookie, /member_id=248238/);
  assert.ok(!seen.some((u) => u.includes("version_download")));
});

test("a catalog pattern picks a specific table file", async () => {
  const out = await v.resolveVpforumsDownload(PAGE, { getCookies: signedIn, filePattern: "1p v600", fetchImpl: fakeFetch([]) });
  assert.equal(out.filename, "Shamrock (Inder 1977) 1p v600.zip");
});

test("no session, or a page without a Download button (signed out), asks the player to sign in", async () => {
  const none = async () => [];
  await assert.rejects(v.resolveVpforumsDownload(PAGE, { getCookies: none, fetchImpl: fakeFetch([]) }), { code: "VPFORUMS_SIGNIN_REQUIRED" });
  const noButton = async () => ({ ok: true, status: 200, headers: new Map(), text: async () => "<p>Sign In</p>" });
  await assert.rejects(v.resolveVpforumsDownload(PAGE, { getCookies: signedIn, fetchImpl: noButton }), { code: "VPFORUMS_SIGNIN_REQUIRED" });
});

test("a session without member_id still downloads (\"Remember me\" left unticked)", async () => {
  const sessionOnly = async () => [{ name: "session_id", value: "abc" }];
  const out = await v.resolveVpforumsDownload(PAGE, { getCookies: sessionOnly, fetchImpl: fakeFetch([]) });
  assert.match(out.filename, /4p v600\.zip$/);
});
