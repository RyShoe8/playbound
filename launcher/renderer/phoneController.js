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

/**
 * Catalog / detail / config signal that this title can use a gamepad.
 */
export async function gameSupportsController(detail, slug) {
  if (detail) {
    if (detail.hasControllerSupport === true) return true;
    if (detail.hasControllerSupport === false) return false;
    const hay = [
      ...(detail.features || []),
      ...(detail.tags || []),
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
  }
  const gameSlug = slug || detail?.slug;
  if (gameSlug) {
    try {
      const clean = String(gameSlug).toLowerCase().replace(/^custom-/, "");
      const support = await window.playbound.getControllerSupport?.(clean);
      if (support && (support.kind === "native" || support.kind === "config" || support.kind === "unwritable")) {
        return true;
      }
    } catch {
      /* ignore */
    }
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
 * Modal: play normally, or use phone as a virtual pad (optional).
 * @param {{ title?: string }} opts
 * @returns {Promise<"normal"|"phone"|"cancel">}
 */
export function promptPlayControllerChoice(opts = {}) {
  const title = opts.title || "this game";
  return new Promise((resolve) => {
    const root = ensureOverlayRoot();
    root.classList.remove("hidden");
    root.innerHTML = `
      <div class="phone-controller-sheet">
        <div class="phone-controller-header">
          <div class="phone-controller-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="11" r="1"/><circle cx="18" cy="13" r="1"/></svg>
            Controller Supported
          </div>
          <h2 id="phone-controller-title">How do you want to play?</h2>
          <p class="phone-controller-lead">
            <strong>${escapeHtml(title)}</strong> supports controllers. Choose your control setup:
          </p>
        </div>

        <div class="phone-controller-choices">
          <button type="button" class="phone-controller-choice-card" data-choice="normal">
            <div class="phone-controller-choice-icon-wrap icon-normal">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
            <div class="phone-controller-choice-text">
              <div class="phone-controller-choice-header">
                <span class="phone-controller-choice-title">Play with PC controls</span>
                <span class="phone-controller-choice-tag">Direct</span>
              </div>
              <span class="phone-controller-choice-sub">Keyboard, mouse, or a controller already plugged into this PC</span>
            </div>
          </button>

          <button type="button" class="phone-controller-choice-card is-featured" data-choice="phone">
            <div class="phone-controller-choice-icon-wrap icon-phone">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </div>
            <div class="phone-controller-choice-text">
              <div class="phone-controller-choice-header">
                <span class="phone-controller-choice-title">Use phone as controller</span>
                <span class="phone-controller-choice-tag is-brand">Touch / Mobile Pad</span>
              </div>
              <span class="phone-controller-choice-sub">Scan a QR code — no app or account required on your phone</span>
            </div>
          </button>
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
            <p class="phone-controller-qr-hint">or open <span class="phone-controller-url">playbound.club/controller/${escapeHtml(code)}</span></p>
            <div style="display:flex;gap:8px;align-items:center;">
              <button type="button" class="btn-secondary btn-sm" id="btn-copy-pairing-link">Copy link</button>
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
      await pb().clipboardWrite(joinUrl);
      setStatus("Pairing link copied to clipboard");
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
      <span>Scan the QR or open playbound.club/controller/${escapeHtml(code)} · then play — the game sees an Xbox pad</span>
    </div>
    <button type="button" class="btn-secondary btn-sm" id="phone-controller-banner-copy">Copy link</button>
    <button type="button" class="btn-secondary btn-sm" id="phone-controller-banner-dismiss" aria-label="Dismiss">✕</button>
  `;
  bar.querySelector("#phone-controller-banner-dismiss")?.addEventListener("click", () => {
    bar.remove();
  });
  bar.querySelector("#phone-controller-banner-copy")?.addEventListener("click", async () => {
    await pb().clipboardWrite(joinUrl);
    setStatus("Phone controller link copied");
  });
}

/**
 * Run before launch. Prompts the player if the game supports a controller.
 * Returns false if the user cancelled.
 */
export async function maybeOfferPhoneControllerThenPlay(detail, playFn, slug) {
  const isSupported = await gameSupportsController(detail, slug || detail?.slug);
  if (!isSupported) {
    await playFn();
    return true;
  }

  const choice = await promptPlayControllerChoice({
    title: detail?.title || detail?.editionName || "This game",
  });
  if (choice === "cancel") {
    setStatus("Launch cancelled");
    return false;
  }

  if (choice === "phone") {
    setStatus("Setting up phone controller…");
    const state = await startCouchSessionQuiet();
    if (!state?.active || !state.session) {
      setStatus("Could not enable phone controller — launching without it", true);
    } else {
      ensureCouchBackground();
      showPhoneJoinBanner(state);
      
      const pairChoice = await promptPhoneControllerPairing({
        session: state.session,
        title: detail?.title || detail?.editionName || "This game",
      });

      if (pairChoice === "cancel") {
        setStatus("Launch cancelled");
        return false;
      }
      if (pairChoice === "skip") {
        setStatus("Launching with PC controls…");
      } else {
        setStatus("Phone controller paired — launching game…");
      }
    }
  }

  if (choice === "normal") {
    if (isBridgeableGamepadConnected()) {
      setStatus("Enabling Universal Gamepad Bridge for controller…");
      void enableGamepadBridge();
    }
  }

  await playFn();
  return true;
}

