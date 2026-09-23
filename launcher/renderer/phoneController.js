/**
 * Optional phone-as-controller at Play time.
 * Games with controller support get a clear choice; Couch Mode is not required.
 */

import { escapeHtml, setStatus } from "./shared.js";
import {
  ensureCouchBackground,
  startCouchSessionQuiet,
} from "./views/couch.js";
import {
  enableGamepadBridge,
  isBridgeableGamepadConnected,
  disableGamepadBridge,
} from "./gamepadBridge.js";

function pb() {
  return window.playbound;
}

/** Prefer the first non-empty array — empty `[]` must not block game-level fallbacks. */
function firstNonEmptyList(...candidates) {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return [];
}

/**
 * Catalog / detail / config signal that this title can use a gamepad.
 *
 * `slug` must be the **game** slug (not an edition slug). Edition Play paths
 * often have features on the edition while the controller config map is keyed
 * by the parent game — pass `detail.gameSlug` or the game slug as `slug`.
 */
export async function gameSupportsController(detail, slug) {
  // Prefer parent game slug, but check both: edition slugs like `ddnet` or `rvgl-online`
  // and parent game slugs like `teeworlds` should both be probed.
  const candidates = [
    detail?.gameSlug,
    slug,
    detail?.slug,
    detail?.editionSlug,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase().replace(/^custom-/, ""));
  const uniqueCandidates = [...new Set(candidates)];

  // 1. Controller configuration profile or native runner exists for this title or edition
  for (const candidate of uniqueCandidates) {
    try {
      const support = await window.playbound.getControllerSupport?.(candidate);
      if (support && (support.kind === "native" || support.kind === "config" || support.kind === "unwritable")) {
        return true;
      }
      if (support?.kind === "unsupported") return false;
    } catch {
      /* ignore */
    }
  }

  // 2. Explicit true on edition or game
  if (detail?.hasControllerSupport === true) return true;

  // 3. Features / tags indicating controller support
  if (detail) {
    const features = [
      ...firstNonEmptyList(detail.features),
      ...firstNonEmptyList(detail.gameFeatures),
    ];
    const tags = [
      ...firstNonEmptyList(detail.tags),
      ...firstNonEmptyList(detail.gameTags),
    ];
    const hay = [
      ...features,
      ...tags,
      String(detail.controllerSupport || ""),
      String(detail.title || ""),
      String(detail.editionName || ""),
    ]
      .join(" | ")
      .toLowerCase();
    if (hay.trim()) {
      if (/\b(no controller|controller not supported|unsupported)\b/.test(hay)) return false;
      if (/\b(controller|gamepad|joystick|flightstick|hotas|wheel|marathon|alephone|aleph one)\b/.test(hay)) return true;
    }
    // Only treat hasControllerSupport === false as definitive rejection if parent game also has no controller features
    if (detail.hasControllerSupport === false && !hay.includes("controller") && !hay.includes("gamepad")) return false;
  }

  return false;
}

function ensureOverlayRoot() {
  let el = document.getElementById("phone-controller-overlay");
  if (el) return el;
  el = document.createElement("div");
  el.id = "phone-controller-overlay";
  el.className = "phone-controller-overlay hidden";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "phone-controller-title");
  document.body.appendChild(el);
  return el;
}

function hideOverlay() {
  const el = document.getElementById("phone-controller-overlay");
  if (el) {
    el.classList.add("hidden");
    el.innerHTML = "";
  }
}

/**
 * Modal: choose Mouse & Keyboard, Controller, or Phone.
 * @param {{ title?: string }} opts
 * @returns {Promise<"keyboard"|"controller"|"phone"|"cancel">}
 */
export function promptPlayControllerChoice(opts = {}) {
  const title = opts.title || "this game";
  const enhancedOnly = opts.playBoundControlsOnly === true;
  const preview = opts.playBoundControlsPreview === true;
  return new Promise((resolve) => {
    const root = ensureOverlayRoot();
    root.classList.remove("hidden");
    root.innerHTML = `
      <div class="phone-controller-sheet">
        <div class="phone-controller-header">
          <div class="phone-controller-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="11" r="1"/><circle cx="18" cy="13" r="1"/></svg>
            Input Setup
          </div>
          <h2 id="phone-controller-title">How do you want to play?</h2>
          <p class="phone-controller-lead">
            <strong>${escapeHtml(title)}</strong> ${preview ? "has a PlayBound Controls preview layout that is still being tested. Choose your control setup:" : enhancedOnly ? "has a PlayBound Controls profile. Choose your control setup:" : "supports controllers. Choose your control setup:"}
          </p>
        </div>

        <div class="phone-controller-choices">
          <button type="button" class="phone-controller-choice-card" data-choice="keyboard">
            <div class="phone-controller-choice-icon-wrap icon-keyboard">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8.01"/><line x1="10" y1="8" x2="10" y2="8.01"/><line x1="14" y1="8" x2="14" y2="8.01"/><line x1="18" y1="8" x2="18" y2="8.01"/><line x1="6" y1="12" x2="6" y2="12.01"/><line x1="18" y1="12" x2="18" y2="12.01"/><line x1="8" y1="16" x2="16" y2="16"/></svg>
            </div>
            <div class="phone-controller-choice-text">
              <div class="phone-controller-choice-header">
                <span class="phone-controller-choice-title">Mouse and Keyboard</span>
                <span class="phone-controller-choice-tag">PC Controls</span>
              </div>
              <span class="phone-controller-choice-sub">Play using standard keyboard and mouse controls</span>
            </div>
          </button>

          <button type="button" class="phone-controller-choice-card" data-choice="controller">
            <div class="phone-controller-choice-icon-wrap icon-controller">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="11" r="1"/><circle cx="18" cy="13" r="1"/></svg>
            </div>
            <div class="phone-controller-choice-text">
              <div class="phone-controller-choice-header">
                <span class="phone-controller-choice-title">${preview ? "PlayBound Controls Preview" : enhancedOnly ? "PlayBound Controls" : "Controller (Gamepad)"}</span>
                <span class="phone-controller-choice-tag">${preview ? "Testing" : enhancedOnly ? "Enhanced" : "Direct"}</span>
              </div>
              <span class="phone-controller-choice-sub">${preview ? "Try this unverified layout and help us tune it" : enhancedOnly ? "Map your controller to this game's keyboard controls" : "Play with an Xbox, PlayStation, Switch Pro, or USB controller"}</span>
            </div>
          </button>

          ${enhancedOnly ? "" : `<button type="button" class="phone-controller-choice-card is-featured" data-choice="phone">
            <div class="phone-controller-choice-icon-wrap icon-phone">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </div>
            <div class="phone-controller-choice-text">
              <div class="phone-controller-choice-header">
                <span class="phone-controller-choice-title">Phone as Controller</span>
                <span class="phone-controller-choice-tag is-brand">Touch / Mobile Pad</span>
              </div>
              <span class="phone-controller-choice-sub">Scan a QR code — no app or account required on your phone</span>
            </div>
          </button>`}
        </div>

        <div class="phone-controller-footer">
          <button type="button" class="btn-ghost phone-controller-cancel-btn" data-choice="cancel">Cancel</button>
        </div>
      </div>
    `;

    const finish = (choice) => {
      hideOverlay();
      resolve(choice);
    };

    root.querySelectorAll("[data-choice]").forEach((btn) => {
      btn.addEventListener("click", () => finish(btn.getAttribute("data-choice")));
    });
    root.addEventListener(
      "click",
      (e) => {
        if (e.target === root) finish("cancel");
      },
      { once: true }
    );
  });
}

/**
 * Shows the pairing modal before game launch so the virtual controller
 * connects to Windows before the game process starts.
 */
export function promptPhoneControllerPairing({ session, title }) {
  return new Promise((resolve) => {
    const root = ensureOverlayRoot();
    root.classList.remove("hidden");
    const joinUrl = session.joinUrl;
    const code = session.joinCode || "";
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}`;

    root.innerHTML = `
      <div class="phone-controller-sheet phone-controller-pairing-sheet">
        <div class="phone-controller-header">
          <div class="phone-controller-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            Connect Phone
          </div>
          <h2 id="phone-controller-title">Scan to connect your controller</h2>
          <p class="phone-controller-lead">
            Scan this QR code with your phone's camera. The game will launch as soon as you're ready.
          </p>
        </div>

        <div class="phone-controller-qr-container">
          <div class="phone-controller-qr-frame">
            <img class="phone-controller-qr-img" src="${qrSrc}" alt="Scan QR code" width="140" height="140" />
          </div>
          <div class="phone-controller-qr-info">
            <div class="phone-controller-code-box">
              <span class="phone-controller-code-label">Room Code</span>
              <span class="phone-controller-code-val">${escapeHtml(code)}</span>
            </div>
            <p class="phone-controller-qr-hint">or open <span class="phone-controller-url">playbound.club/c</span> and enter <strong>${escapeHtml(code)}</strong></p>
            <div style="display:flex;gap:8px;align-items:center;">
              <button type="button" class="btn-secondary btn-sm" id="btn-copy-pairing-link">Copy code</button>
            </div>
            <div class="phone-controller-status-pill" id="phone-controller-pair-status">
              <span class="pbc-pulse-dot"></span>
              <span id="phone-pair-status-text">Waiting for phone to scan…</span>
            </div>
          </div>
        </div>

        <div class="phone-controller-pairing-actions">
          <button type="button" class="btn-primary phone-controller-action-btn" id="btn-launch-paired">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Launch Game
          </button>
          <button type="button" class="btn-secondary phone-controller-action-btn" id="btn-skip-phone">Play without phone</button>
          <button type="button" class="btn-ghost phone-controller-cancel-btn" id="btn-cancel-pairing">Cancel</button>
        </div>
      </div>
    `;

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      hideOverlay();
      resolve(result);
    };

    // Live update when controller connects
    if (window.playbound.onCouchState) {
      window.playbound.onCouchState((st) => {
        const controllers = st?.session?.controllers || [];
        const approved = controllers.some((c) => c.status === "approved");
        if (approved) {
          const pill = document.getElementById("phone-controller-pair-status");
          const text = document.getElementById("phone-pair-status-text");
          if (pill && text) {
            pill.classList.add("is-connected");
            text.textContent = "Phone connected! Ready to launch.";
          }
        }
      });
    }

    document.getElementById("btn-copy-pairing-link")?.addEventListener("click", async () => {
      await pb().clipboardWrite(code);
      setStatus("Code copied — open playbound.club/c on the phone and enter it");
    });

    document.getElementById("btn-launch-paired")?.addEventListener("click", () => finish("launch"));
    document.getElementById("btn-skip-phone")?.addEventListener("click", () => finish("skip"));
    document.getElementById("btn-cancel-pairing")?.addEventListener("click", () => finish("cancel"));
  });
}

function showPhoneJoinBanner(state) {
  const session = state?.session;
  if (!session?.joinUrl) return;
  const joinUrl = session.joinUrl;
  const code = session.joinCode || "";
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(joinUrl)}`;

  let bar = document.getElementById("phone-controller-banner");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "phone-controller-banner";
    document.body.appendChild(bar);
  }
  bar.className = "phone-controller-banner";
  bar.innerHTML = `
    <img class="phone-controller-banner-qr" src="${qrSrc}" alt="" width="72" height="72" />
    <div class="phone-controller-banner-copy">
      <strong>Phone controller ready</strong>
      <span>Scan the QR, or open playbound.club/c and enter ${escapeHtml(code)}</span>
    </div>
    <button type="button" class="btn-secondary btn-sm" id="phone-controller-banner-copy">Copy code</button>
    <button type="button" class="btn-secondary btn-sm" id="phone-controller-banner-dismiss" aria-label="Dismiss">✕</button>
  `;
  bar.querySelector("#phone-controller-banner-dismiss")?.addEventListener("click", () => {
    bar.remove();
  });
  bar.querySelector("#phone-controller-banner-copy")?.addEventListener("click", async () => {
    await pb().clipboardWrite(code);
    setStatus("Code copied — open playbound.club/c on the phone and enter it");
  });
}

/**
 * Run before launch. Prompts the player if the game supports a controller.
 * Returns false if the user cancelled.
 */
export async function maybeOfferPhoneControllerThenPlay(detail, playFn, slug) {
  let couchAlreadyActive = false;
  try {
    couchAlreadyActive = Boolean((await window.playbound?.couchState?.())?.active);
  } catch {
    couchAlreadyActive = false;
  }

  const gameSlug = detail?.gameSlug || slug || detail?.slug;
  let enhancedAvailable = false;
  let enhancedPreview = false;
  try {
    const availability = await pb()?.getPlayBoundControlsAvailability?.(gameSlug, detail?.editionSlug || null);
    enhancedAvailable = Boolean(availability?.available);
    enhancedPreview = enhancedAvailable && Boolean(availability?.preview);
  } catch {
    // A failed profile lookup must not block an ordinary game launch.
  }
  const isSupported = enhancedAvailable || await gameSupportsController(detail, gameSlug);
  if (!isSupported) {
    await playFn({ inputMode: "keyboard" });
    return true;
  }

  // Always ask — even when party couch already started. Skipping used to force
  // inputMode "phone" and hide keyboard/controller, which felt broken on both PCs.
  const choice = await promptPlayControllerChoice({
    title: detail?.title || detail?.editionName || "This game",
    playBoundControlsOnly: enhancedAvailable,
    playBoundControlsPreview: enhancedPreview,
  });
  if (choice === "cancel") {
    setStatus("Launch cancelled");
    return false;
  }

  let finalMode = "keyboard";

  if (choice === "phone") {
    finalMode = "phone";
    if (couchAlreadyActive) {
      // Online multiplayer already owns the couch session — don't mint a second one
      // or enable Gamepad Bridge (that mirrored host pad into OpenBOR P1+P2).
      await disableGamepadBridge();
      ensureCouchBackground();
      setStatus("Online controllers already active — launching…");
    } else {
      setStatus("Setting up phone controller…");
      const state = await startCouchSessionQuiet();
      if (!state?.active || !state.session) {
        setStatus("Could not enable phone controller — launching with PC controls", true);
        finalMode = "controller";
      } else {
        ensureCouchBackground();

        const pairChoice = await promptPhoneControllerPairing({
          session: state.session,
          title: detail?.title || detail?.editionName || "This game",
        });

        if (pairChoice === "cancel") {
          document.getElementById("phone-controller-banner")?.remove();
          setStatus("Launch cancelled");
          return false;
        }
        if (pairChoice === "skip") {
          document.getElementById("phone-controller-banner")?.remove();
          setStatus("Launching with PC controller…");
          finalMode = "controller";
        } else {
          showPhoneJoinBanner(state);
          setStatus("Phone controller paired — launching game…");
        }
      }
    }
  } else if (choice === "controller") {
    finalMode = "controller";
    if (enhancedAvailable) {
      // Keyboard/mouse synthesis consumes the physical pad directly. A virtual
      // Xbox pad would add a second input device without helping this game.
      await disableGamepadBridge();
    } else {
      // Hard rule: never bridge while a couch session is running.
      if (couchAlreadyActive) {
        await disableGamepadBridge();
      } else if (isBridgeableGamepadConnected()) {
        setStatus("Enabling Universal Gamepad Bridge for controller…");
        const bridged = await enableGamepadBridge();
        if (!bridged) {
          setStatus("Could not enable controller bridge — launching anyway", true);
        }
      }
    }
  } else {
    // choice === "keyboard"
    finalMode = "keyboard";
    await disableGamepadBridge();
  }

  await playFn({ inputMode: finalMode, ...(finalMode === "controller" && enhancedPreview ? { controlsPreview: true } : {}) });
  return true;
}

