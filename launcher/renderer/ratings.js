/**
 * Editorial Rating and Community Rating in the launcher.
 *
 * The numbers come from the site's /api/games/<slug>/ratings, which already
 * aggregates them (platform/src/lib/ratings.ts); this module only draws them,
 * so the launcher and the website always show the same scores. The few
 * per-review helpers here mirror that file — keep the two in step.
 */

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** An outlet score on 0–100, or null when unscored or malformed. */
export function normalizedScore(review) {
  const { score, scoreMax } = review || {};
  if (typeof score !== "number" || typeof scoreMax !== "number" || scoreMax <= 0 || score < 0 || score > scoreMax) return null;
  return Math.round((score / scoreMax) * 100);
}

/** "8/10", "4.5/5", or the printed grade ("B+"). */
export function outletScoreLabel(review) {
  if (normalizedScore(review) == null) return null;
  if (review.scoreText) return review.scoreText;
  const n = Number.isInteger(review.score) ? String(review.score) : String(Number(review.score.toFixed(1)));
  return `${n}/${review.scoreMax}`;
}

/** positive ≥75, mixed 50–74, negative <50 — the site's bands. */
export function toneFor(score100) {
  if (score100 == null) return "none";
  if (score100 >= 75) return "positive";
  if (score100 >= 50) return "mixed";
  return "negative";
}

function tile(value, tone, extraClass = "") {
  return `<span class="rating-tile rating-tile-${tone} ${extraClass}">${esc(value ?? "tbd")}</span>`;
}

/** Hero chip pair; empty string when neither rating has anything to show. */
export function ratingChipsHtml(ratings) {
  const e = ratings?.editorial;
  const c = ratings?.community;
  if (!e || !c || (e.totalCount === 0 && c.count === 0)) return "";
  return `<button type="button" class="rating-chips" data-ratings-jump>
      <span class="rating-chip">${tile(e.score, toneFor(e.score), "rating-tile-sm")}<span><b>Editorial</b><small>${e.scoredCount} reviews</small></span></span>
      <span class="rating-chip">${tile(c.score == null ? null : c.score.toFixed(1), toneFor(c.score == null ? null : c.score * 10), "rating-tile-sm rating-tile-round")}<span><b>Community</b><small>${c.count} ratings</small></span></span>
    </button>`;
}

/**
 * The block at the top of a Reviews tab: both aggregates, then each outlet's
 * snippet with a link to the full review. `subject` reads "this game" or
 * "the X edition".
 */
export function ratingsPanelHtml(ratings, { subject = "this game", minEditorial = 3, minCommunity = 3 } = {}) {
  const e = ratings?.editorial || { score: null, scoredCount: 0, totalCount: 0, verdict: null };
  const c = ratings?.community || { score: null, count: 0, verdict: null };
  const reviews = Array.isArray(ratings?.reviews) ? ratings.reviews : [];
  const summary = `
    <div class="ratings-summary">
      <div class="ratings-summary-card">
        ${tile(e.score, toneFor(e.score), "rating-tile-lg")}
        <div>
          <div class="ratings-summary-kicker">Editorial Rating</div>
          <div class="ratings-summary-verdict">${esc(e.verdict?.label || "Not enough reviews yet")}</div>
          <div class="ratings-summary-detail">${
            e.score == null
              ? `Shown once ${minEditorial} scored outlet reviews of ${esc(subject)} are in (${e.scoredCount} so far).`
              : `Average of ${e.scoredCount} published outlet reviews, out of 100.`
          }</div>
        </div>
      </div>
      <div class="ratings-summary-card">
        ${tile(c.score == null ? null : c.score.toFixed(1), toneFor(c.score == null ? null : c.score * 10), "rating-tile-lg rating-tile-round")}
        <div>
          <div class="ratings-summary-kicker">Community Rating</div>
          <div class="ratings-summary-verdict">${esc(c.verdict?.label || "Not enough ratings yet")}</div>
          <div class="ratings-summary-detail">${
            c.score == null
              ? `Shown once ${minCommunity} PlayBound players have rated ${esc(subject)} (${c.count} so far).`
              : `From ${c.count} PlayBound player ratings, out of 10.`
          }</div>
        </div>
      </div>
    </div>`;
  if (!reviews.length) return summary;
  const list = reviews
    .map((r) => {
      const n = normalizedScore(r);
      const label = outletScoreLabel(r);
      const date = r.publishedAt ? new Date(r.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "";
      return `<div class="editorial-review-card" data-review-url="${esc(r.url)}" role="link" tabindex="0">
          ${tile(n == null ? "—" : n, toneFor(n))}
          <div class="editorial-review-body">
            <div class="editorial-review-meta"><strong>${esc(r.outlet)}</strong>${r.author ? ` <span>by ${esc(r.author)}</span>` : ""}${
              label ? ` <span>· scored ${esc(label)}</span>` : ""
            }${date ? ` <span>· ${esc(date)}</span>` : ""}</div>
            ${r.snippet ? `<p class="editorial-review-snippet">“${esc(r.snippet)}”</p>` : ""}
            <span class="editorial-review-link">Read the full review ↗</span>
          </div>
        </div>`;
    })
    .join("");
  return `${summary}
    <div class="tab-panel-header"><h2>Editorial Reviews</h2></div>
    <p class="editorial-review-note">Scores as each outlet published them, shown out of 100 for the average.</p>
    <div class="editorial-review-list">${list}</div>`;
}

/** Open each review on the outlet's site when its card is clicked. */
export function bindRatingsPanel(root, openExternal) {
  root?.querySelectorAll("[data-review-url]").forEach((el) => {
    const open = () => openExternal(el.dataset.reviewUrl, { campaign: "launcher_editorial_review" });
    el.addEventListener("click", open);
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        open();
      }
    });
  });
}
