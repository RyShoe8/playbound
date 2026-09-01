/**
 * Why an itch.io page yielded no downloads.
 *
 * The scraper looks for `data-upload_id`, which itch emits only for files it
 * will hand over without a purchase. Its absence has several unrelated causes,
 * and the old message named none of them — so a freshly catalogued game failed
 * with nothing to act on. These pin the wording to the cause.
 *
 * Run: node services/itchDiagnose.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Lifted from main.js rather than reimplemented — the message is the behaviour.
function load() {
  const src = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const start = src.indexOf("function itchNoDownloadsReason(");
  assert.notEqual(start, -1, "itchNoDownloadsReason not found in main.js");
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return new Function(`${src.slice(start, i + 1)} return itchNoDownloadsReason;`)();
}

const reason = load();
const URL = "https://someone.itch.io/meteorite";

test("a browser game is named as one, with what to do instead", () => {
  const html = `<div class="html_embed_widget"><iframe id="game_drop"></iframe></div>`;
  const msg = reason(html, URL);
  assert.match(msg, /browser game/i);
  assert.match(msg, /browser-playable/i);
  assert.ok(msg.includes(URL), "the page must be named");
});

test("a paid game says the download is not free rather than missing", () => {
  const msg = reason(`<div class="buy_row"><a class="buy_btn">Buy Now</a></div>`, URL);
  assert.match(msg, /sells the game/i);
  assert.match(msg, /external/i);
});

test("a login wall is distinguished from having no files", () => {
  const msg = reason(`<p>You must be logged in to download this</p>`, URL);
  assert.match(msg, /needs an account/i);
});

test("a dead URL points at the catalog entry", () => {
  const msg = reason(`<html><title>Not Found | itch.io</title></html>`, URL);
  assert.match(msg, /does not exist/i);
  assert.match(msg, /check the url/i);
});

test("an unrecognised page still lists the likely causes", () => {
  const msg = reason(`<html><body>something else entirely</body></html>`, URL);
  assert.match(msg, /browser-only, paid, or the URL/i);
});

test("the reason survives a page it cannot classify and no URL", () => {
  // Never throw from an error path — that would replace a bad message with a
  // worse stack trace.
  assert.equal(typeof reason("", undefined), "string");
  assert.ok(reason("", undefined).length > 0);
});
