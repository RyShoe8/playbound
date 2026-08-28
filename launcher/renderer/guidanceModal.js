/**
 * In-launcher guidance modal for First Play Steps & Multiplayer Gaming Steps.
 * Shown when launching a game if firstPlaySteps or multiplayerGamingSteps are returned.
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureGuidanceRoot() {
  let el = document.getElementById("launch-guidance-overlay");
  if (el) return el;
  el = document.createElement("div");
  el.id = "launch-guidance-overlay";
  el.className = "launch-guidance-overlay hidden";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "launch-guidance-title");
  document.body.appendChild(el);
  return el;
}

export function hideLaunchGuidanceModal() {
  const el = document.getElementById("launch-guidance-overlay");
  if (el) {
    el.classList.add("hidden");
    el.innerHTML = "";
  }
}

/**
 * Show a modal with First Play Steps and/or Multiplayer Gaming Steps.
 */
export function showLaunchGuidanceModal(opts = {}) {
  const {
    title = "Game",
    firstPlaySteps = null,
    multiplayerGamingSteps = null,
    launchCount = 1,
    address = null,
  } = opts;

  if (
    (!Array.isArray(firstPlaySteps) || firstPlaySteps.length === 0) &&
    (!Array.isArray(multiplayerGamingSteps) || multiplayerGamingSteps.length === 0)
  ) {
    return;
  }

  const root = ensureGuidanceRoot();
  root.classList.remove("hidden");

  let firstPlayHtml = "";
  if (Array.isArray(firstPlaySteps) && firstPlaySteps.length > 0) {
    const stepItems = firstPlaySteps
      .map((s, idx) => {
        const text = typeof s === "string" ? s : s?.text || "";
        const cmd = typeof s === "object" ? s?.command : null;
        return `
          <li class="guidance-step-item">
            <span class="guidance-step-num">${idx + 1}</span>
            <div class="guidance-step-content">
              <p class="guidance-step-text">${escapeHtml(text)}</p>
              ${
                cmd
                  ? `<pre class="guidance-step-cmd"><code>${escapeHtml(cmd)}</code></pre>`
                  : ""
              }
            </div>
          </li>
        `;
      })
      .join("");

    firstPlayHtml = `
      <div class="guidance-section guidance-section-firstplay">
        <div class="guidance-section-header">
          <span class="guidance-badge guidance-badge-firstplay">First-Time Setup (Launch ${launchCount} of 2)</span>
          <h3 class="guidance-section-title">First Play Guide</h3>
        </div>
        <ol class="guidance-step-list">
          ${stepItems}
        </ol>
      </div>
    `;
  }

  let multiplayerHtml = "";
  if (Array.isArray(multiplayerGamingSteps) && multiplayerGamingSteps.length > 0) {
    const stepItems = multiplayerGamingSteps
      .map((s, idx) => {
        const text = typeof s === "string" ? s : s?.text || "";
        const cmd = typeof s === "object" ? s?.command : null;
        return `
          <li class="guidance-step-item">
            <span class="guidance-step-num guidance-step-num-multi">${idx + 1}</span>
            <div class="guidance-step-content">
              <p class="guidance-step-text">${escapeHtml(text)}</p>
              ${
                cmd
                  ? `<pre class="guidance-step-cmd"><code>${escapeHtml(cmd)}</code></pre>`
                  : ""
              }
            </div>
          </li>
        `;
      })
      .join("");

    multiplayerHtml = `
      <div class="guidance-section guidance-section-multi">
        <div class="guidance-section-header">
          <span class="guidance-badge guidance-badge-multi">Multiplayer Connection</span>
          <h3 class="guidance-section-title">How to Connect In-Game</h3>
        </div>
        ${
          address
            ? `
          <div class="guidance-address-box">
            <div class="guidance-address-label">Party Server Address</div>
            <div class="guidance-address-val-wrap">
              <span class="guidance-address-val" id="guidance-addr-text">${escapeHtml(address)}</span>
              <button type="button" class="guidance-btn-copy" id="guidance-copy-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy Address
              </button>
            </div>
          </div>
        `
            : ""
        }
        <ol class="guidance-step-list">
          ${stepItems}
        </ol>
      </div>
    `;
  }

  root.innerHTML = `
    <div class="guidance-card">
      <div class="guidance-header">
        <div>
          <h2 id="launch-guidance-title" class="guidance-title">${escapeHtml(title)} Launched</h2>
          <p class="guidance-subtitle">Quick guidance for your play session</p>
        </div>
        <button type="button" class="guidance-btn-close" id="guidance-close-top" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="guidance-body">
        ${firstPlayHtml}
        ${multiplayerHtml}
      </div>

      <div class="guidance-actions">
        <button type="button" class="guidance-btn-primary" id="guidance-dismiss-btn">
          Got It, Let's Play
        </button>
      </div>
    </div>
  `;

  const closeTop = root.querySelector("#guidance-close-top");
  const dismissBtn = root.querySelector("#guidance-dismiss-btn");
  const copyBtn = root.querySelector("#guidance-copy-btn");

  const cleanup = () => {
    window.removeEventListener("keydown", handleKey);
    hideLaunchGuidanceModal();
  };

  const handleKey = (e) => {
    if (e.key === "Escape") cleanup();
  };

  closeTop?.addEventListener("click", cleanup);
  dismissBtn?.addEventListener("click", cleanup);

  root.onclick = (e) => {
    if (e.target === root) cleanup();
  };

  window.addEventListener("keydown", handleKey);

  copyBtn?.addEventListener("click", async () => {
    if (address && window.playbound?.clipboardWrite) {
      await window.playbound.clipboardWrite(address);
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        if (copyBtn) copyBtn.textContent = "Copy Address";
      }, 2000);
    }
  });
}

/**
 * Convenience helper to inspect play() result and show modal if steps present.
 */
export function maybeShowLaunchGuidance(res, context = {}) {
  if (!res) return;
  const firstPlaySteps = res.firstPlaySteps;
  const multiplayerGamingSteps = res.multiplayerGamingSteps;

  if (
    (Array.isArray(firstPlaySteps) && firstPlaySteps.length > 0) ||
    (Array.isArray(multiplayerGamingSteps) && multiplayerGamingSteps.length > 0)
  ) {
    showLaunchGuidanceModal({
      title: context.title || context.slug || "Game",
      firstPlaySteps,
      multiplayerGamingSteps,
      launchCount: res.launchCount || 1,
      address: context.address || res.connect || null,
    });
  }
}
