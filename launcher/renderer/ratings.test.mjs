import test from "node:test";
import assert from "node:assert/strict";
import { normalizedScore, outletScoreLabel, ratingChipsHtml, ratingsPanelHtml, toneFor } from "./ratings.js";

const ratings = {
  editorial: { score: 82, scoredCount: 3, totalCount: 4, verdict: { label: "Generally favorable", tone: "positive" } },
  community: { score: 7.4, count: 9, verdict: { label: "Mixed or average", tone: "mixed" } },
  reviews: [
    { id: "a", outlet: "Wccftech", author: "Sam", url: "https://wccftech.com/review/x/", snippet: "Sharp <and> generous.", score: 8.5, scoreMax: 10, scoreText: null, publishedAt: "2026-11-04T00:00:00.000Z" },
    { id: "b", outlet: "GameRevolution", author: null, url: "https://example.com/b", snippet: null, score: 83, scoreMax: 100, scoreText: "B", publishedAt: null },
    { id: "c", outlet: "Polygon", author: null, url: "https://polygon.com/c", snippet: null, score: null, scoreMax: null, scoreText: null, publishedAt: null },
  ],
};

test("scores normalise and print as the outlet published them", () => {
  assert.equal(normalizedScore({ score: 4, scoreMax: 5 }), 80);
  assert.equal(normalizedScore({ score: 11, scoreMax: 10 }), null);
  assert.equal(outletScoreLabel({ score: 8.5, scoreMax: 10 }), "8.5/10");
  assert.equal(outletScoreLabel({ score: 83, scoreMax: 100, scoreText: "B" }), "B");
  assert.equal(outletScoreLabel({ score: null, scoreMax: null }), null);
  assert.equal(toneFor(75), "positive");
  assert.equal(toneFor(74), "mixed");
  assert.equal(toneFor(40), "negative");
});

test("hero chips appear only when there is something to show", () => {
  assert.match(ratingChipsHtml(ratings), /Editorial[\s\S]*Community/);
  assert.equal(ratingChipsHtml({ editorial: { totalCount: 0 }, community: { count: 0 } }), "");
  assert.equal(ratingChipsHtml(null), "");
});

test("the panel lists every review with an escaped snippet and a link out", () => {
  const html = ratingsPanelHtml(ratings);
  assert.match(html, /Generally favorable/);
  assert.match(html, /7\.4/);
  assert.match(html, /data-review-url="https:\/\/wccftech\.com\/review\/x\/"/);
  assert.match(html, /Sharp &lt;and&gt; generous\./);
  assert.match(html, /scored B/);
  assert.equal((html.match(/Read the full review/g) || []).length, 3);
});

test("an unrated game explains what is missing", () => {
  const html = ratingsPanelHtml(
    { editorial: { score: null, scoredCount: 1, totalCount: 1, verdict: null }, community: { score: null, count: 0, verdict: null }, reviews: [] },
    { subject: "the OpenMW edition" }
  );
  assert.match(html, /Not enough reviews yet/);
  assert.match(html, /scored outlet reviews of the OpenMW edition are in \(1 so far\)/);
  assert.doesNotMatch(html, /Editorial Reviews/);
});
