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
import { phoneHubDecision, phoneHubPairedAt } from "./phoneHubLease.js";
import {
  CALIBRATION_STEPS,
  buildCalibratedProfile,
  hatReading,
  movedAxis,
  pressedButton,
  snapshot,
} from "./flightCalibration.js";

const PHONE_HUB_LEASE_KEY = "playbound.phone-hub.lease";

function readPhoneHubLease() {
  try {
    return JSON.parse(sessionStorage.getItem(PHONE_HUB_LEASE_KEY) || "null");
  } catch {
    return null;
  }
}

function writePhoneHubLease(lease) {
  try {
    sessionStorage.setItem(PHONE_HUB_LEASE_KEY, JSON.stringify(lease));
  } catch {
    /* Session storage is optional; this run still works. */
  }
}

function clearPhoneHubLease() {
  try {
    sessionStorage.removeItem(PHONE_HUB_LEASE_KEY);
  } catch {
    /* ignore */
  }
}

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

function gameSupportsFlightstick(detail, slug) {
  if (slug === "star-wars-fate-of-the-galaxy" || detail?.gameSlug === "star-wars-fate-of-the-galaxy") return true;
  return [...firstNonEmptyList(detail?.features), ...firstNonEmptyList(detail?.gameFeatures),
    ...firstNonEmptyList(detail?.tags), ...firstNonEmptyList(detail?.gameTags)]
    .some((value) => /\b(flightstick|hotas|joystick) support\b/i.test(String(value)));
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
 * @returns {Promise<"keyboard"|"controller"|"flightstick"|"phone"|"cancel">}
 */
export function promptPlayControllerChoice(opts = {}) {
  const title = opts.title || "this game";
  const enhancedOnly = opts.playBoundControlsOnly === true;
  const preview = opts.playBoundControlsPreview === true;
  const supplementsNativePad = opts.supplementsNativePad === true;
  const flightstick = opts.flightstick === true;
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
              <span class="phone-controller-choice-sub">${supplementsNativePad ? "Triggers control the flippers; the game's native pad controls the plunger and nudge. This layout is still being tested." : preview ? "Use a connected controller: PlayBound maps it to this game's keyboard and mouse controls. This layout is still being tested." : enhancedOnly ? "Use a connected controller: PlayBound maps it to this game's keyboard and mouse controls." : "Use a connected Xbox, PlayStation, Switch Pro, or USB controller with this game's own controller controls."}</span>
            </div>
          </button>

          ${flightstick ? `<button type="button" class="phone-controller-choice-card" data-choice="flightstick">
            <div class="phone-controller-choice-icon-wrap icon-controller">✈</div>
            <div class="phone-controller-choice-text">
              <div class="phone-controller-choice-header"><span class="phone-controller-choice-title">Flight Stick / HOTAS</span><span class="phone-controller-choice-tag">Native</span></div>
              <span class="phone-controller-choice-sub">Use a flight stick, separate throttle, and other flight controls. PlayBound will detect them without a gamepad bridge.</span>
            </div>
          </button>` : ""}

          ${enhancedOnly ? "" : `<button type="button" class="phone-controller-choice-card is-featured" data-choice="phone">
            <div class="phone-controller-choice-icon-wrap icon-phone">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            </div>
            <div class="phone-controller-choice-text">
              <div class="phone-controller-choice-header">
                <span class="phone-controller-choice-title">Use Your Phone</span>
                <span class="phone-controller-choice-tag is-brand">Touch Pad or Wireless Hub</span>
              </div>
              <span class="phone-controller-choice-sub">Scan a QR code — no app needed. Use your phone as a touchscreen gamepad itself, or as a hub to connect a wireless/Bluetooth controller to your PC.</span>
            </div>
          </button>`}
        </div>

        ${!enhancedOnly ? `<button type="button" class="phone-controller-choice-card" data-choice="mixed"><span class="phone-controller-choice-text"><span class="phone-controller-choice-title">USB controllers + phone controller</span><span class="phone-controller-choice-sub">Local multiplayer: press a button on each USB controller first, then pair the extra controller through your phone before launching.</span></span></button>` : ""}
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
 * Calibrate an unmeasured flight device: one prompt per control, detected live
 * from the Gamepad API. Resolves to a profile (see flightCalibration.js) or
 * null if the player cancels. Optional steps can be skipped.
 */
function runFlightCalibration({ vidPid, label }) {
  return new Promise((resolve) => {
    const findPad = () => Array.from(navigator.getGamepads?.() || []).find((p) => p && vidPidFromPadId(p.id) === vidPid) || null;
    const root = ensureOverlayRoot();
    root.classList.remove("hidden");
    const captured = {};
    let idle = null;
    let stepIndex = -1;
    let samples = [];
    let raf = 0;
    let settleUntil = 0;

    const render = (message, step) => {
      root.innerHTML = `<div class="phone-controller-sheet">
        <div class="phone-controller-header"><div class="phone-controller-badge">Calibrate · ${escapeHtml(label || "Flight device")}</div>
          <h2 id="phone-controller-title">${escapeHtml(message)}</h2>
          <p class="phone-controller-lead">${step
            ? `Step ${stepIndex + 1} of ${CALIBRATION_STEPS.length}. ${step.optional ? "Skip it if your device has no such control." : ""}`
            : "Leave every control centred and the throttle where it rests, then start."}</p></div>
        <div class="phone-controller-footer"><button type="button" class="btn-ghost" data-cancel>Cancel</button>
          ${step?.optional ? '<button type="button" class="btn-secondary" data-skip>Skip</button>' : ""}
          ${step ? "" : '<button type="button" class="btn-primary" data-start>Start</button>'}</div></div>`;
      root.querySelector("[data-cancel]")?.addEventListener("click", () => finish(null));
      root.querySelector("[data-skip]")?.addEventListener("click", () => next());
      root.querySelector("[data-start]")?.addEventListener("click", () => {
        const pad = findPad();
        if (!pad) { setStatus("Move the stick once so PlayBound can see it, then press Start.", true); return; }
        idle = snapshot(pad);
        next();
      });
    };

    const assigned = (kind) => CALIBRATION_STEPS.filter((s) => s.kind === kind && Number.isInteger(captured[s.key])).map((s) => captured[s.key]);

    const next = () => {
      stepIndex++;
      samples = [];
      if (stepIndex >= CALIBRATION_STEPS.length) return finish(buildCalibratedProfile({ vidPid, label, idle, captured }));
      settleUntil = performance.now() + 350;
      render(CALIBRATION_STEPS[stepIndex].prompt, CALIBRATION_STEPS[stepIndex]);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const step = CALIBRATION_STEPS[stepIndex];
      const pad = findPad();
      if (!step || !pad || !idle || performance.now() < settleUntil) return;
      const now = snapshot(pad);
      if (step.kind === "axis") {
        samples.push(now);
        const axis = movedAxis(samples, { exclude: assigned("axis") });
        // Accept once the swing is clear and the control is back near rest.
        if (axis !== null && Math.abs(now.axes[axis] - idle.axes[axis]) < 0.25) { captured[step.key] = axis; next(); }
      } else if (step.kind === "button") {
        const button = pressedButton(idle, now, { exclude: assigned("button") });
        if (button !== null) { captured[step.key] = button; settleUntil = performance.now() + 450; next(); }
      } else if (step.kind === "hat") {
        const reading = hatReading(idle, now);
        if (reading) { captured[step.key] = reading.direction; settleUntil = performance.now() + 450; next(); }
      }
    };

    const finish = (profile) => {
      cancelAnimationFrame(raf);
      hideOverlay();
      resolve(profile);
    };

    render("Calibrate your flight device");
    raf = requestAnimationFrame(tick);
  });
}

/** "044f:b67c" from a Gamepad id, matching services/flightDevices.js. */
function vidPidFromPadId(id) {
  const text = String(id || "");
  const chrome = text.match(/vendor:\s*([0-9a-f]{4})\s*product:\s*([0-9a-f]{4})/i);
  if (chrome) return `${chrome[1]}:${chrome[2]}`.toLowerCase();
  const firefox = text.match(/^([0-9a-f]{4})-([0-9a-f]{4})-/i);
  return firefox ? `${firefox[1]}:${firefox[2]}`.toLowerCase() : null;
}

/** Offer calibration when the chosen stick has no measured profile. True when one was saved. */
async function offerFlightCalibration(device) {
  if (!device?.vidPid || device.profileSource) return false;
  const wants = await new Promise((resolve) => {
    const root = ensureOverlayRoot();
    root.classList.remove("hidden");
    root.innerHTML = `<div class="phone-controller-sheet">
      <div class="phone-controller-header"><div class="phone-controller-badge">Flight controls</div>
        <h2 id="phone-controller-title">Calibrate ${escapeHtml(device.name)}?</h2>
        <p class="phone-controller-lead">PlayBound has no measured layout for this device yet, so it will use a standard flight-stick layout. A one-minute calibration finds your throttle, twist, hat and buttons exactly, and is shared so other owners of this device skip it.</p></div>
      <div class="phone-controller-footer"><button type="button" class="btn-ghost" data-later>Use the standard layout</button>
        <button type="button" class="btn-primary" data-calibrate>Calibrate now</button></div></div>`;
    root.querySelector("[data-later]").addEventListener("click", () => { hideOverlay(); resolve(false); });
    root.querySelector("[data-calibrate]").addEventListener("click", () => { hideOverlay(); resolve(true); });
  });
  if (!wants) return false;
  const profile = await runFlightCalibration({ vidPid: device.vidPid, label: device.name });
  if (!profile) return false;
  const saved = await pb().saveFlightCalibration?.(profile);
  if (!saved?.ok) { setStatus(saved?.error || "Could not save the calibration.", true); return false; }
  setStatus(saved.shared ? "Calibration saved and shared for review." : "Calibration saved on this PC.");
  return true;
}

function promptFsoHotasDevices(devices) {
  return new Promise((resolve) => {
    const root = ensureOverlayRoot();
    root.classList.remove("hidden");
    const flightDevices = devices.filter((device) => /flight|hotas|stick|throttle|rudder|pedal|yoke|virpil|vkb/i.test(device.name)).slice(0, 4);
    const options = devices.map((device) => `<option value="${device.id}">${escapeHtml(device.name)}</option>`).join("");
    root.innerHTML = `<div class="phone-controller-sheet">
      <div class="phone-controller-header"><div class="phone-controller-badge">Flight controls</div>
        <h2 id="phone-controller-title">Choose your flight devices</h2>
        <p class="phone-controller-lead">Set Joy0 to your primary stick, then add a separate throttle or pedals as Joy1–3. FreeSpace Open will recognize each device; bind individual axes in its Controls menu.</p></div>
      <div class="phone-controller-choices">${[0, 1, 2, 3].map((slot) =>
        `<label class="phone-controller-choice-card"><span class="phone-controller-choice-title">Joy${slot} ${slot === 0 ? "· primary stick" : "· optional"}</span>
          <select class="rounded-lg border border-border bg-secondary px-3 py-2 text-sm" data-joy-slot="${slot}">
            <option value="">${slot === 0 ? "Choose a flight stick" : "None"}</option>${options}</select></label>`
      ).join("")}</div>
      <div class="phone-controller-footer"><button type="button" class="btn-ghost" data-cancel>Cancel</button>
        <button type="button" class="btn-primary" data-confirm>Use selected devices</button></div></div>`;
    root.querySelectorAll("[data-joy-slot]").forEach((select, index) => {
      select.value = flightDevices[index] ? String(flightDevices[index].id) : "";
    });
    root.querySelector("[data-cancel]").addEventListener("click", () => { hideOverlay(); resolve(null); });
    root.querySelector("[data-confirm]").addEventListener("click", () => {
      const slots = [...root.querySelectorAll("[data-joy-slot]")].map((el) => el.value);
      const ids = slots.filter(Boolean).map(Number);
      if (!slots[0] || slots.some((value, index) => value && slots.slice(0, index).some((prior) => !prior)) ||
          ids.length !== new Set(ids).size) {
        setStatus("Choose Joy0 first, fill slots in order, and use each device only once", true); return;
      }
      hideOverlay();
      resolve(ids);
    });
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
    let removeStateListener = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      removeStateListener?.();
      hideOverlay();
      resolve(result);
    };

    // Live update when controller connects
    if (window.playbound.onCouchState) {
      removeStateListener = window.playbound.onCouchState((st) => {
        const controllers = st?.session?.snapshot?.controllers || [];
        const approved = controllers.some((c) => c.status === "approved");
        if (approved) {
          const pill = document.getElementById("phone-controller-pair-status");
          const text = document.getElementById("phone-pair-status-text");
          if (pill && text) {
            const connected = st?.clients?.some((client) =>
              controllers.some((controller) => controller.status === "approved" && controller.controllerId === client.controllerId)
            );
            pill.classList.toggle("is-connected", Boolean(connected));
            text.textContent = connected
              ? "Phone connected! Ready to launch."
              : "Phone approved — connecting its controls to this PC…";
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
  let activeCouchState = null;
  let couchAlreadyActive = false;
  try {
    activeCouchState = await window.playbound?.couchState?.();
    couchAlreadyActive = Boolean(activeCouchState?.active);
  } catch {
    couchAlreadyActive = false;
  }

  const gameSlug = detail?.gameSlug || slug || detail?.slug;
  let enhancedAvailable = false;
  let enhancedPreview = false;
  let enhancedSupplemental = false;
  try {
    const availability = await pb()?.getPlayBoundControlsAvailability?.(gameSlug, detail?.editionSlug || null);
    enhancedAvailable = Boolean(availability?.available);
    enhancedPreview = enhancedAvailable && Boolean(availability?.preview);
    enhancedSupplemental = enhancedAvailable && Boolean(availability?.supplementsNativePad);
    if (!enhancedAvailable && availability?.reason) console.info(`[playbound-controls] no controls popup for ${gameSlug}: ${availability.reason}`);
  } catch {
    // A failed profile lookup must not block an ordinary game launch.
  }
  const hasFlightstick = gameSupportsFlightstick(detail, gameSlug);
  const isSupported = enhancedAvailable || hasFlightstick || await gameSupportsController(detail, gameSlug);
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
    supplementsNativePad: enhancedSupplemental,
    flightstick: hasFlightstick,
  });
  if (choice === "cancel") {
    setStatus("Launch cancelled");
    return false;
  }

  let finalMode = "keyboard";
  let phoneHubSession = null;

  if (choice === "flightstick") {
    finalMode = "flightstick";
    await disableGamepadBridge();
    if (gameSlug === "star-wars-fate-of-the-galaxy") {
      setStatus("Detecting flight stick and throttle in FreeSpace Open…");
      const result = await pb().getFsoHotasDevices();
      if (result?.error || !result?.devices?.length) {
        setStatus(result?.error || "No flight devices detected. Connect your stick and throttle, then try again.", true);
        return false;
      }
      const selected = await promptFsoHotasDevices(result.devices);
      if (!selected) { setStatus("Launch cancelled"); return false; }
      // An unmeasured Joy0 stick: offer to measure it before binding.
      await offerFlightCalibration(result.devices.find((device) => device.id === selected[0]));
      let mapping;
      try { mapping = await pb().saveFsoHotasDevices(selected); }
      catch (error) { setStatus(`Could not configure flight devices: ${error.message}`, true); return false; }
      setStatus(mapping?.throttleConfigured
        ? (mapping.measured
          ? `${mapping.device} set up: throttle, roll, hat and buttons bound for you. Your original settings are backed up.`
          : `${mapping.device} set up with the standard flight-stick layout (throttle, roll, fire). Fine-tune it in Controls if anything is off.`)
        : "Flight devices configured. Bind the throttle axis in FreeSpace Open's Controls menu.");
    }
  } else if (choice === "phone" || choice === "mixed") {
    finalMode = "phone";
    if (couchAlreadyActive && activeCouchState?.session?.solo) {
      // The approved phone can move between games for two hours. Once that
      // window has passed, keep its current game alive and only re-pair when
      // the player chooses a different game.
      try {
        activeCouchState = await pb().couchRefresh?.() || activeCouchState;
      } catch {
        /* use the last known snapshot */
      }
      if (choice === "mixed" || phoneHubDecision(activeCouchState.session, readPhoneHubLease(), gameSlug) === "rotate") {
        const stopped = await pb().couchStop?.();
        if (!stopped?.ok) {
          setStatus("Could not reset the phone hub. Try again from Connect.", true);
          return false;
        }
        clearPhoneHubLease();
        couchAlreadyActive = false;
        activeCouchState = null;
      }
    }

    if (couchAlreadyActive && !activeCouchState?.session?.solo) {
      // Online multiplayer already owns the couch session — don't mint a second one
      // or enable Gamepad Bridge (that mirrored host pad into OpenBOR P1+P2).
      await disableGamepadBridge();
      ensureCouchBackground();
      setStatus("Online controllers already active — launching…");
    } else if (
      couchAlreadyActive &&
      phoneHubDecision(activeCouchState?.session, readPhoneHubLease(), gameSlug) === "reuse"
    ) {
      await disableGamepadBridge();
      ensureCouchBackground();
      phoneHubSession = activeCouchState.session;
      setStatus("Phone hub connected — launching…");
    } else {
      setStatus("Setting up phone controller…");
      // Solo: this mints a session purely to plumb one phone's transport for
      // single-player, not a real couch party — lets PlayBound Controls
      // activate off it (see the couchHost solo check in applyControllerConfig)
      // without ever doing so during actual multiplayer couch co-op.
      const state = couchAlreadyActive
        ? activeCouchState
        : await startCouchSessionQuiet({ solo: choice !== "mixed" });
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
          phoneHubSession = state.session;
          showPhoneJoinBanner(state);
          setStatus("Launching with phone controller — keep your phone connected…");
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
  if (finalMode === "phone" && phoneHubSession) {
    const previous = readPhoneHubLease();
    writePhoneHubLease({
      sessionId: phoneHubSession.sessionId,
      gameSlug,
      pairedAt: phoneHubPairedAt(
        phoneHubSession,
        previous?.sessionId === phoneHubSession.sessionId ? previous.pairedAt : Date.now()
      ),
    });
  }
  return true;
}

