"use strict";
const assert = require("node:assert/strict");
const { isDeadlyStreamFilePage, parseDownloadLink, filenameFrom, resolveDeadlyStreamDownload } = require("./deadlystreamDownload");

assert.ok(isDeadlyStreamFilePage("https://deadlystream.com/files/file/428-extended-enclave-tslrcm-add-on/"));
assert.ok(isDeadlyStreamFilePage("https://deadlystream.com/files/file/428-extended-enclave-tslrcm-add-on/?r=9"));
assert.ok(!isDeadlyStreamFilePage("https://evil.example/files/file/428-x/"));
assert.ok(!isDeadlyStreamFilePage("http://deadlystream.com/files/file/428-x/"));
assert.ok(!isDeadlyStreamFilePage("https://deadlystream.com/topic/2689-modextended/"));

const HTML = `<a href='https://deadlystream.com/files/file/428-ee/?do=download&amp;csrfKey=aa11bb22' class='ipsButton'>Download this file</a>
<a href='https://deadlystream.com/files/file/428-ee/?do=download&amp;r=77&amp;csrfKey=aa11bb22'>Part two</a>`;
assert.equal(parseDownloadLink(HTML), "https://deadlystream.com/files/file/428-ee/?do=download&csrfKey=aa11bb22");
assert.equal(parseDownloadLink(HTML, "77"), "https://deadlystream.com/files/file/428-ee/?do=download&r=77&csrfKey=aa11bb22");
assert.equal(parseDownloadLink(HTML, "99"), null);
assert.equal(parseDownloadLink("<p>no link</p>"), null);

assert.equal(filenameFrom('attachment; filename="Extended Enclave.2.5.2.rar"'), "Extended Enclave.2.5.2.rar");
assert.equal(filenameFrom("attachment; filename*=UTF-8''A%20B.zip"), "A B.zip");
assert.equal(filenameFrom('attachment; filename="../evil.zip"'), ".._evil.zip");
assert.equal(filenameFrom(null), null);

(async () => {
  const calls = [];
  const CHOOSER = HTML;
  const fakeFetch = async (url, opts = {}) => {
    calls.push({ url, cookie: opts.headers?.cookie, redirect: opts.redirect });
    if (/\?do=download$/.test(url)) return { ok: true, status: 200, text: async () => CHOOSER };
    if (/do=download/.test(url)) {
      assert.equal(opts.headers.cookie, "ips4_IPSSessionFront=abc");
      return { status: 200, ok: true, headers: new Map([["content-disposition", 'attachment; filename="x.zip"'], ["content-length", "1234"]]), body: { cancel: async () => {} } };
    }
    return { ok: true, status: 200, headers: { getSetCookie: () => ["ips4_IPSSessionFront=abc; path=/; HttpOnly"] }, text: async () => HTML };
  };
  const r = await resolveDeadlyStreamDownload("https://deadlystream.com/files/file/428-ee/?r=77", fakeFetch);
  assert.equal(r.url, "https://deadlystream.com/files/file/428-ee/?do=download&r=77&csrfKey=aa11bb22");
  assert.equal(r.filename, "x.zip");
  assert.equal(r.bytes, 1234);
  assert.equal(r.headers.cookie, "ips4_IPSSessionFront=abc");
  assert.equal(calls[0].url, "https://deadlystream.com/files/file/428-ee/", "the ?r= selector is not sent to the page request");

  const noCookie = async () => ({ ok: true, status: 200, headers: { getSetCookie: () => [] }, text: async () => HTML });
  await assert.rejects(resolveDeadlyStreamDownload("https://deadlystream.com/files/file/428-ee/", noCookie), /anonymous/);
  console.log("deadlystreamDownload tests passed");
})();
