/**
 * In-launcher guidance modal for all games:
 * Controls (Keyboard & Controller), How to Leave the Game, and Quick Tips.
 * Shown when launching any game so players always know the controls and how to exit.
 */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSingleKeyCombo(combo) {
  if (!combo) return "";
  if (combo.includes(" + ")) {
    return combo
      .split(" + ")
      .map((k) => `<kbd class="guidance-key">${escapeHtml(k.trim())}</kbd>`)
      .join('<span class="guidance-key-join">+</span>');
  }
  if (/\b(Ctrl|Alt|Shift)\+[A-Za-z0-9]+/i.test(combo)) {
    return combo
      .split("+")
      .map((k) => `<kbd class="guidance-key">${escapeHtml(k.trim())}</kbd>`)
      .join('<span class="guidance-key-join">+</span>');
  }
  return `<kbd class="guidance-key">${escapeHtml(combo)}</kbd>`;
}

function renderKeyBadges(inputStr) {
  if (!inputStr) return "";
  if (inputStr.includes(" / ")) {
    return inputStr
      .split(" / ")
      .map((part) => renderSingleKeyCombo(part.trim()))
      .join('<span class="guidance-key-sep">or</span>');
  }
  return renderSingleKeyCombo(inputStr);
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

const CONTROL_SCHEME_LABELS = {
  keyboard: "Mouse & Keyboard",
  controller: "Controller",
  flightstick: "Flightstick",
  touch: "Touch",
};

const CONTROL_GROUP_ORDER = [
  "Movement",
  "Combat",
  "Interaction",
  "Interface",
  "Camera",
  "Inventory",
  "Multiplayer",
  "Vehicle",
  "Flight",
  "Building",
  "Other",
];

/**
 * Show a modal with Controls, How to Leave the Game, First Play Steps, and/or Multiplayer Steps.
 */
export function showLaunchGuidanceModal(opts = {}) {
  const {
    title = "Game",
    controls = null,
    howToQuit = null,
    firstPlaySteps = null,
    multiplayerGamingSteps = null,
    address = null,
  } = opts;

  const root = ensureGuidanceRoot();
  root.classList.remove("hidden");

  // 1. Leave the game callout
  const leaveText =
    howToQuit ||
    "Press Escape on the keyboard to leave the game or exit to menu (Alt+F4 also works).";

  const leaveHtml = `
    <div class="guidance-leave-callout">
      <div class="guidance-leave-callout-header">
        <span class="guidance-badge guidance-badge-quit">How to Leave</span>
        <span class="guidance-leave-title">Leaving the Game</span>
      </div>
      <p class="guidance-leave-desc">${escapeHtml(leaveText)}</p>
    </div>
  `;

  // 2. Controls Section (Keyboard & Controller)
  let controlsHtml = "";
  const schemes = Array.isArray(controls?.schemes)
    ? controls.schemes.filter((s) => s && (s.bindings?.length || s.notes || s.supported === false))
    : [];

  if (schemes.length > 0) {
    const tabsHtml = schemes
      .map((s, idx) => {
        const label = CONTROL_SCHEME_LABELS[s.scheme] || s.scheme;
        return `
          <button type="button" class="guidance-tab-btn ${idx === 0 ? "active" : ""}" data-scheme="${escapeHtml(s.scheme)}">
            ${escapeHtml(label)}
          </button>
        `;
      })
      .join("");

    const panelsHtml = schemes
      .map((s, idx) => {
        if (s.supported === false) {
          return `
            <div class="guidance-scheme-panel ${idx === 0 ? "" : "hidden"}" data-scheme-panel="${escapeHtml(s.scheme)}">
              <p class="guidance-controls-note">${escapeHtml(title)} does not support this input method.</p>
            </div>
          `;
        }

        const buckets = new Map();
        for (const b of s.bindings || []) {
          const g = b.group || "Other";
          if (!buckets.has(g)) buckets.set(g, []);
          buckets.get(g).push(b);
        }

        const sortedGroups = CONTROL_GROUP_ORDER.filter((g) => buckets.has(g));
        // Add any groups not in the predefined order
        for (const g of buckets.keys()) {
          if (!sortedGroups.includes(g)) sortedGroups.push(g);
        }

        const groupsHtml = sortedGroups
          .map((g) => {
            const rows = buckets
              .get(g)
              .map(
                (b) => `
                <div class="guidance-binding-row">
                  <div class="guidance-binding-info">
                    <span class="guidance-binding-action">${escapeHtml(b.action)}</span>
                    ${b.note ? `<span class="guidance-binding-note">${escapeHtml(b.note)}</span>` : ""}
                  </div>
                  <div class="guidance-binding-keys">
                    ${renderKeyBadges(b.input)}
                  </div>
                </div>
              `
              )
              .join("");

            return `
              <div class="guidance-group-block">
                <div class="guidance-group-header">
                  <span class="guidance-group-title">${escapeHtml(g)}</span>
                </div>
                <div class="guidance-binding-list">
                  ${rows}
                </div>
              </div>
            `;
          })
          .join("");

        const noteHtml = s.notes
          ? `<p class="guidance-controls-note">${escapeHtml(s.notes)}</p>`
          : "";

        return `
          <div class="guidance-scheme-panel ${idx === 0 ? "" : "hidden"}" data-scheme-panel="${escapeHtml(s.scheme)}">
            ${groupsHtml || "<p class=\"guidance-controls-note\">Default controls active.</p>"}
            ${noteHtml}
          </div>
        `;
      })
      .join("");

    const overallNotes = controls?.notes
      ? `<p class="guidance-controls-note" style="margin-top: 10px;">${escapeHtml(controls.notes)}</p>`
      : "";

    controlsHtml = `
      <div class="guidance-section guidance-section-controls">
        <div class="guidance-section-header">
          <span class="guidance-badge guidance-badge-controls">Controls</span>
          <h3 class="guidance-section-title">In-Game Controls</h3>
        </div>
        <div class="guidance-controls-tabs">
          ${tabsHtml}
        </div>
        ${panelsHtml}
        ${overallNotes}
      </div>
    `;
  }

  // 3. First Play Tips (filtered to avoid duplicating leave instructions)
  let firstPlayHtml = "";
  const filteredFirstPlay = Array.isArray(firstPlaySteps)
    ? firstPlaySteps.filter((s) => {
        const text = String(typeof s === "string" ? s : s?.text || "").toLowerCase();
        return !text.includes("escape on the host") && !text.includes("leave the game") && !text.includes("leave the match");
      })
    : [];

  if (filteredFirstPlay.length > 0) {
    const stepItems = filteredFirstPlay
      .map((s, idx) => {
        const text = typeof s === "string" ? s : s?.text || "";
        const cmd = typeof s === "object" ? s?.command : null;
        return `
          <li class="guidance-step-item">
            <span class="guidance-step-num">${idx + 1}</span>
            <div class="guidance-step-content">
              <p class="guidance-step-text">${escapeHtml(text)}</p>
              ${cmd ? `<pre class="guidance-step-cmd"><code>${escapeHtml(cmd)}</code></pre>` : ""}
            </div>
          </li>
        `;
      })
      .join("");

    firstPlayHtml = `
      <div class="guidance-section guidance-section-firstplay">
        <div class="guidance-section-header">
          <span class="guidance-badge guidance-badge-firstplay">Quick Tips</span>
          <h3 class="guidance-section-title">First Play Guide</h3>
        </div>
        <ol class="guidance-step-list">
          ${stepItems}
        </ol>
      </div>
    `;
  }

  // 4. Multiplayer connection
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
              ${cmd ? `<pre class="guidance-step-cmd"><code>${escapeHtml(cmd)}</code></pre>` : ""}
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
          <h2 id="launch-guidance-title" class="guidance-title">${escapeHtml(title)} · Controls &amp; Help</h2>
          <p class="guidance-subtitle">In-game controls, how to leave the game, and quick tips</p>
        </div>
        <button type="button" class="guidance-btn-close" id="guidance-close-top" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="guidance-body">
        ${leaveHtml}
        ${controlsHtml}
        ${multiplayerHtml}
        ${firstPlayHtml}
      </div>

      <div class="guidance-actions">
        <button type="button" class="guidance-btn-primary" id="guidance-dismiss-btn">
          Got It, Let's Play
        </button>
      </div>
    </div>
  `;

  // Attach tab events
  root.querySelectorAll(".guidance-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scheme = btn.getAttribute("data-scheme");
      root.querySelectorAll(".guidance-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      root.querySelectorAll(".guidance-scheme-panel").forEach((panel) => {
        if (panel.getAttribute("data-scheme-panel") === scheme) {
          panel.classList.remove("hidden");
        } else {
          panel.classList.add("hidden");
        }
      });
    });
  });

  const closeTop = root.querySelector("#guidance-close-top");
  const dismissBtn = root.querySelector("#guidance-dismiss-btn");
  const copyBtn = root.querySelector("#guidance-copy-btn");

  const cleanup = () => {
    window.removeEventListener("keydown", handleKey);
    hideLaunchGuidanceModal();
  };

  const handleKey = (e) => {
    if (e.key === "Escape" || e.key === "Enter") cleanup();
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
 * Convenience helper to inspect play() result and show help panel for any game.
 */
export async function maybeShowLaunchGuidance(res, context = {}) {
  const slug = res?.slug || context.slug || "";
  const title = res?.title || context.title || context.slug || "Game";
  let controls = res?.controls || context.controls || null;
  const howToQuit = res?.howToQuit || context.howToQuit || null;
  const firstPlaySteps = res?.firstPlaySteps || context.firstPlaySteps || null;
  const multiplayerGamingSteps =
    res?.multiplayerGamingSteps || context.multiplayerGamingSteps || null;
  const address = context.address || res?.connect || null;
  const launchCount = res?.launchCount || 1;

  if (!controls && slug && window.playbound?.getGameControls) {
    try {
      controls = await window.playbound.getGameControls(slug);
    } catch {
      // ignore
    }
  }

  showLaunchGuidanceModal({
    title,
    slug,
    controls,
    howToQuit,
    firstPlaySteps,
    multiplayerGamingSteps,
    launchCount,
    address,
  });
}
