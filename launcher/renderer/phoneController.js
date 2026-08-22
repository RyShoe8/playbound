/**
 * Optional phone-as-controller at Play time.
 * Games with controller support get a clear choice; Couch Mode is not required.
 */

import { escapeHtml, setStatus } from "./shared.js";
import {
  ensureCouchBackground,
  startCouchSessionQuiet,
} from "./views/couch.js";

function pb() {
  return window.playbound;
}

/**
 * Catalog / detail signal that this title can use a gamepad.
 */
export function gameSupportsController(detail) {
  if (!detail) return false;
  if (detail.hasControllerSupport === true) return true;
  if (detail.hasControllerSupport === false) return false;
  const hay = [
    ...(detail.features || []),
    ...(detail.tags || []),
    String(detail.controllerSupport || ""),
  ]
    .join(" | ")
    .toLowerCase();
  if (!hay.trim()) return false;
  if (/\b(no controller|controller not supported|unsupported)\b/.test(hay)) return false;
  return /\b(controller|gamepad|joystick|flightstick|hotas|wheel)\b/.test(hay);
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
        <p class="phone-controller-eyebrow">Controller</p>
        <h2 id="phone-controller-title">How do you want to play?</h2>
        <p class="phone-controller-lead">
          ${escapeHtml(title)} supports a controller. You can use a pad on this PC,
          keyboard and mouse, or turn your phone into a controller — your choice.
        </p>
        <div class="phone-controller-choices">
          <button type="button" class="btn-success phone-controller-choice" data-choice="normal">
            <span class="phone-controller-choice-title">Play normally</span>
            <span class="phone-controller-choice-sub">Keyboard, mouse, or a controller already on this PC</span>
          </button>
          <button type="button" class="btn-primary phone-controller-choice" data-choice="phone">
            <span class="phone-controller-choice-title">Use phone as controller</span>
            <span class="phone-controller-choice-sub">Scan a QR code — no PlayBound account on the phone</span>
          </button>
        </div>
        <button type="button" class="btn-secondary phone-controller-cancel" data-choice="cancel">Cancel</button>
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
 * Run before launch. Returns false if the user cancelled.
 */
export async function maybeOfferPhoneControllerThenPlay(detail, playFn) {
  if (!gameSupportsController(detail)) {
    await playFn();
    return true;
  }

  const choice = await promptPlayControllerChoice({
    title: detail.title || detail.editionName || "This game",
  });
  if (choice === "cancel") {
    setStatus("Launch cancelled");
    return false;
  }

  if (choice === "phone") {
    setStatus("Setting up phone controller…");
    const state = await startCouchSessionQuiet();
    if (!state?.active) {
      setStatus("Could not enable phone controller — launching without it", true);
    } else {
      ensureCouchBackground();
      showPhoneJoinBanner(state);
      setStatus("Phone controller live — scan the QR, then enjoy the game");
    }
  }

  await playFn();
  return true;
}
