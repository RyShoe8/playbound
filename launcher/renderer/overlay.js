/**
 * The in-game overlay — the one in-game helper, opened with Ctrl+P.
 *
 * Game: the launched game's controls, how to leave, first-play tips and the
 * party address — what used to be a modal over the launcher at launch. The
 * renderer hands it over through set-overlay-guide; see guidanceModal.js.
 *
 * Server: renders from the game's declared settings, exactly like the party
 * window on the site — no game is named anywhere in this file. The
 * definitions, the apply modes and the reasons a control is absent all come
 * from /api/parties/:id/server-settings; see docs/server-control.md.
 *
 * Controls: live tuning for an active PlayBound Controls session — sensitivity
 * and invert-Y, applied to the running Input Engine instantly via
 * gamepadBridge's `updateControlsSettings` (see services/gamepadBridge.js),
 * no alt-tab and no restart. Independent of party state on purpose: most
 * PlayBound Controls V1 games are single-player, so it must work exactly the
 * same whether or not a party is open, unlike the Server tab.
 */

const root = document.getElementById("root");
const subject = document.getElementById("subject");
const tabsEl = document.getElementById("tabs");

let state = {
  data: null,
  draft: {},
  partyId: null,
  busy: false,
  error: null,
  notice: null,
  tes3mp: null,
  tes3mpAccount: "",
  tes3mpBusy: false,
  tes3mpHour: 12,
  tes3mpHourBusy: false,
  activeTab: "game",
  tabInitialized: false,
  controls: null,
  guide: null,
  guideScheme: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The worst apply mode among the keys being changed.
 *
 * The same rule as strongestApplyMode on the site, over definitions the server
 * sent — so the ordering lives in one place conceptually even though this
 * process cannot import it.
 */
const APPLY_COST = { live: 0, "next-round": 1, restart: 2 };
function strongestApply(definitions, keys) {
  let worst = null;
  for (const key of keys) {
    const def = definitions.find((d) => d.key === key);
    if (!def) continue;
    if (!worst || APPLY_COST[def.apply] > APPLY_COST[worst]) worst = def.apply;
  }
  return worst;
}

function changedKeys() {
  const { data, draft } = state;
  if (!data?.supported) return [];
  return data.definitions
    .map((d) => d.key)
    .filter((key) => draft[key] !== undefined && draft[key] !== data.values[key]);
}

function controlHtml(def, value) {
  const label = `<span>${escapeHtml(def.label)}${
    def.help ? ` <span class="help">${escapeHtml(def.help)}</span>` : ""
  }</span>`;

  if (def.type === "boolean") {
    return `<label class="row toggle" data-key="${escapeHtml(def.key)}">${label}
      <input type="checkbox" data-key="${escapeHtml(def.key)}" ${value ? "checked" : ""} />
    </label>`;
  }
  if (def.type === "enum") {
    const options = def.options
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}" ${
            String(o.value) === String(value) ? "selected" : ""
          }>${escapeHtml(o.label)}</option>`
      )
      .join("");
    return `<label class="row">${label}
      <select data-key="${escapeHtml(def.key)}">${options}</select>
    </label>`;
  }
  if (def.type === "number") {
    return `<label class="row">${label}
      <input type="number" data-key="${escapeHtml(def.key)}" value="${escapeHtml(value)}"
        ${def.min !== undefined ? `min="${escapeHtml(def.min)}"` : ""}
        ${def.max !== undefined ? `max="${escapeHtml(def.max)}"` : ""} />
    </label>`;
  }
  return `<label class="row">${label}
    <input type="text" data-key="${escapeHtml(def.key)}" value="${escapeHtml(value)}" />
  </label>`;
}

function renderServerTab() {
  const { data } = state;

  if (!data) {
    root.innerHTML = `<p class="note">Loading…</p>`;
    return;
  }

  if (data.error || !state.partyId) {
    root.innerHTML = `<p class="note">${escapeHtml(
      data.error || "No party is open right now."
    )}</p>`;
    return;
  }

  if (!data.supported) {
    /*
     * Same rule as the site's panel: a game assessed as unable to do something
     * gets the reason, a game nobody has assessed gets a plain line. "Not yet"
     * is not worth a paragraph over someone's match.
     */
    const impossible = (data.features || []).filter((f) => f.status === "unavailable");
    const reasons = impossible
      .map(
        (f) =>
          `<p class="note"><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.reason)}</p>`
      )
      .join("");
    root.innerHTML = `<p class="note">${escapeHtml(data.reason || "Nothing to control here.")}</p>${reasons}`;
    return;
  }

  const changed = changedKeys();
  /*
   * Before the room exists, a change costs nothing and disconnects nobody —
   * it is a choice about how the server will start. So no apply warning, and
   * a button that says what it does.
   */
  const preLaunch = data.phase === "pre-launch";
  const mode = preLaunch ? null : strongestApply(data.definitions, changed);
  const controls = data.definitions
    .map((def) => controlHtml(def, state.draft[def.key] ?? data.values[def.key] ?? def.default))
    .join("");

  const statusLine = preLaunch
    ? "Not started yet — these are what it will start with"
    : data.status?.status === "running"
      ? `${data.status.host}:${data.status.port}`
      : data.status?.status === "unknown"
        ? "Status unavailable"
        : data.status?.status || "";

  const warning =
    mode === "restart"
      ? `<p class="note warn">Applying this restarts the server and disconnects everyone on it${
          data.partySize > 1 ? `, including the ${data.partySize} of you in this party` : ""
        }.</p>`
      : mode === "next-round"
        ? `<p class="note">Takes effect at the next round. Nobody is disconnected.</p>`
        : "";

  const button = data.canEdit
    ? `<button class="apply" id="apply" ${
        state.busy || !changed.length || data.status?.status === "unknown" ? "disabled" : ""
      }>${
        state.busy
          ? preLaunch
            ? "Saving…"
            : mode === "restart"
              ? "Restarting…"
              : "Applying…"
          : preLaunch
            ? "Save for launch"
            : "Apply changes"
      }</button>`
    : `<p class="note">Only the party leader can change these.</p>`;

  const tes3mp = state.tes3mp;
  let tes3mpHtml = "";
  if (data.gameSlug === "morrowind" && !preLaunch && data.canEdit) {
    let adminBlock = "";
    if (!tes3mp) {
      adminBlock = `<p class="note">TES3MP admin: loading accounts…</p>`;
    } else if (tes3mp.adminAccount) {
      adminBlock = `<p class="note">TES3MP admin: <strong>${escapeHtml(
        tes3mp.adminAccount
      )}</strong></p>`;
    } else {
      const accounts = Array.isArray(tes3mp.accounts) ? tes3mp.accounts : [];
      const options = accounts
        .map(
          (a) =>
            `<option value="${escapeHtml(a.accountName)}" ${
              state.tes3mpAccount === a.accountName ? "selected" : ""
            }>${escapeHtml(a.accountName)}${a.online ? " (online)" : ""}</option>`
        )
        .join("");
      adminBlock = `
        <p class="note">Log into TES3MP first, then claim admin for your account.</p>
        ${
          accounts.length
            ? `<label class="row"><span>Your TES3MP account</span>
                <select id="tes3mp-account">${options}</select>
              </label>`
            : `<p class="note">No accounts yet — finish login in TES3MP, then reopen this panel.</p>`
        }
        <button class="apply" id="tes3mp-claim" ${
          state.tes3mpBusy || !accounts.length ? "disabled" : ""
        }>${state.tes3mpBusy ? "Claiming…" : "Claim admin"}</button>`;
    }

    const hourOptions = Array.from({ length: 24 }, (_, h) => {
      const label =
        h === 0 ? "0 — midnight" : h === 6 ? "6 — dawn" : h === 12 ? "12 — noon" : h === 18 ? "18 — dusk" : String(h);
      return `<option value="${h}" ${Number(state.tes3mpHour) === h ? "selected" : ""}>${label}</option>`;
    }).join("");

    tes3mpHtml = `<div class="tes3mp">
      ${adminBlock}
      <p class="note">Time of day (same as <code>/sethour</code>)</p>
      <label class="row"><span>Hour</span>
        <select id="tes3mp-hour">${hourOptions}</select>
      </label>
      <button class="apply" id="tes3mp-set-hour" ${state.tes3mpHourBusy ? "disabled" : ""}>${
        state.tes3mpHourBusy ? "Setting…" : "Set hour"
      }</button>
    </div>`;
  }

  root.innerHTML = `
    <p class="note">${escapeHtml(statusLine)}</p>
    ${tes3mpHtml}
    ${controls}
    ${warning}
    ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
    ${state.notice ? `<p class="note">${escapeHtml(state.notice)}</p>` : ""}
    ${button}
    <p class="hint">Esc to close</p>
  `;

  root.querySelectorAll("[data-key]").forEach((el) => {
    if (el.tagName === "LABEL") return;
    const key = el.dataset.key;
    const def = data.definitions.find((d) => d.key === key);
    el.addEventListener("change", () => {
      let value;
      if (def.type === "boolean") value = el.checked;
      else if (def.type === "number") value = Number(el.value);
      else if (def.type === "enum") {
        const picked = def.options.find((o) => String(o.value) === el.value);
        value = picked ? picked.value : el.value;
      } else value = el.value;
      state.draft = { ...state.draft, [key]: value };
      render();
    });
  });

  const applyBtn = document.getElementById("apply");
  if (applyBtn) applyBtn.addEventListener("click", () => void apply());

  const accountSelect = document.getElementById("tes3mp-account");
  if (accountSelect) {
    accountSelect.addEventListener("change", () => {
      state.tes3mpAccount = accountSelect.value;
    });
    if (!state.tes3mpAccount && accountSelect.value) state.tes3mpAccount = accountSelect.value;
  }
  const claimBtn = document.getElementById("tes3mp-claim");
  if (claimBtn) claimBtn.addEventListener("click", () => void claimTes3mp());

  const hourSelect = document.getElementById("tes3mp-hour");
  if (hourSelect) {
    hourSelect.addEventListener("change", () => {
      state.tes3mpHour = Number(hourSelect.value);
    });
  }
  const setHourBtn = document.getElementById("tes3mp-set-hour");
  if (setHourBtn) setHourBtn.addEventListener("click", () => void setTes3mpHour());
}

/** One decimal is plenty for a slider readout; more just looks noisy. */
function fmt1(n) {
  return Number(n).toFixed(1);
}

function sliderRow({ id, label, value, min, max, step }) {
  return `<label class="row slider-row" for="${id}">
    <span>${escapeHtml(label)}<span class="slider-value" id="${id}-value">${fmt1(value)}</span></span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" />
  </label>`;
}

function renderControlsTab() {
  const info = state.controls;

  if (!info) {
    root.innerHTML = `<p class="note">PlayBound Controls isn't active for this game right now.</p>`;
    return;
  }

  const s = info.settings;
  root.innerHTML = `
    <p class="note"><strong>${escapeHtml(info.profileName)}</strong>${
      info.gameTitle ? ` — ${escapeHtml(info.gameTitle)}` : ""
    }</p>
    ${sliderRow({ id: "cs-sensitivity", label: "Look sensitivity", value: s.sensitivity, min: 0.1, max: 5, step: 0.05 })}
    <label class="row toggle" for="cs-invert-y"><span>Invert Y</span>
      <input type="checkbox" id="cs-invert-y" ${s.invertY ? "checked" : ""} />
    </label>
    <details class="note"><summary>View controls</summary>
      ${(info.bindings || []).map((binding) => `<p><strong>${escapeHtml(binding.input.replace(/_/g, " "))}</strong> — ${escapeHtml(binding.action)}</p>`).join("") || "No button bindings are listed."}
    </details>
    <p class="hint">Changes apply instantly — no need to alt-tab. Esc to close</p>
  `;

  const sensitivity = document.getElementById("cs-sensitivity");
  const sensitivityValue = document.getElementById("cs-sensitivity-value");
  sensitivity?.addEventListener("input", () => {
    const value = Number(sensitivity.value);
    if (sensitivityValue) sensitivityValue.textContent = fmt1(value);
    void updateControlsSettings({ sensitivity: value });
  });

  const invertY = document.getElementById("cs-invert-y");
  invertY?.addEventListener("change", () => {
    void updateControlsSettings({ invertY: invertY.checked });
  });
}

/**
 * Push a live setting change to the running Input Engine. Updates local
 * state from the (possibly clamped) settings the main process actually
 * applied, rather than assuming the raw slider value stuck — the session may
 * have ended between the slider event and this call resolving.
 */
async function updateControlsSettings(partial) {
  if (!window.playbound?.updatePlayBoundControlsSettings) return;
  const settings = await window.playbound.updatePlayBoundControlsSettings(partial);
  if (settings && state.controls) state.controls = { ...state.controls, settings };
}

function kbdHtml(input) {
  return String(input || "")
    .split(" / ")
    .map((combo) =>
      combo
        .split(/\s*\+\s*/)
        .map((k) => `<kbd>${escapeHtml(k)}</kbd>`)
        .join("+")
    )
    .join(" or ");
}

function stepsHtml(steps) {
  const items = (Array.isArray(steps) ? steps : [])
    .map((s) => {
      const text = typeof s === "string" ? s : s?.text || "";
      const cmd = typeof s === "object" && s ? s.command : null;
      return text || cmd
        ? `<li>${escapeHtml(text)}${cmd ? ` <code>${escapeHtml(cmd)}</code>` : ""}</li>`
        : "";
    })
    .join("");
  return items ? `<ol class="guide-steps">${items}</ol>` : "";
}

function guideControlsHtml(g) {
  const schemes = Array.isArray(g.controls?.schemes)
    ? g.controls.schemes.filter((s) => s && (s.bindings?.length || s.notes || s.supported === false))
    : [];
  const current = schemes.find((s) => s.scheme === state.guideScheme) || schemes[0] || null;
  if (!current) return "";

  const labels = g.schemeLabels || {};
  const order = Array.isArray(g.groupOrder) ? g.groupOrder : [];
  const groups = new Map();
  for (const b of current.bindings || []) {
    const name = b.group || "Other";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(b);
  }
  const names = [
    ...order.filter((n) => groups.has(n)),
    ...[...groups.keys()].filter((n) => !order.includes(n)),
  ];
  const body =
    current.supported === false
      ? `<p class="note">${escapeHtml(g.title)} does not support this input method.</p>`
      : names
          .map(
            (n) =>
              `<p class="guide-section">${escapeHtml(n)}</p>` +
              groups
                .get(n)
                .map(
                  (b) =>
                    `<div class="binding"><span>${escapeHtml(b.action)}${
                      b.note ? ` <span class="help">${escapeHtml(b.note)}</span>` : ""
                    }</span><span>${kbdHtml(b.input)}</span></div>`
                )
                .join("")
          )
          .join("") || `<p class="note">Default controls.</p>`;
  const tabs =
    schemes.length > 1
      ? `<div class="scheme-tabs">${schemes
          .map(
            (s) =>
              `<button class="tab ${s === current ? "active" : ""}" data-scheme="${escapeHtml(
                s.scheme
              )}">${escapeHtml(labels[s.scheme] || s.scheme)}</button>`
          )
          .join("")}</div>`
      : "";
  return `<p class="guide-section">Controls</p>${tabs}${body}${
    current.notes ? `<p class="note">${escapeHtml(current.notes)}</p>` : ""
  }${g.controls?.notes ? `<p class="note">${escapeHtml(g.controls.notes)}</p>` : ""}`;
}

function renderGameTab() {
  const g = state.guide;
  if (!g) {
    root.innerHTML = `<p class="note">Launch a game from PlayBound to see its controls and tips here.</p>
      <p class="hint">Esc to close</p>`;
    return;
  }

  const firstPlay = (Array.isArray(g.firstPlaySteps) ? g.firstPlaySteps : []).filter((s) => {
    const text = String(typeof s === "string" ? s : s?.text || "").toLowerCase();
    return (
      !text.includes("escape on the host") &&
      !text.includes("leave the game") &&
      !text.includes("leave the match")
    );
  });
  const connectSteps = Array.isArray(g.multiplayerGamingSteps) ? g.multiplayerGamingSteps : [];

  root.innerHTML = `
    ${
      g.slowSeconds
        ? `<p class="note warn">${escapeHtml(g.title)} can take up to ${escapeHtml(
            g.slowSeconds
          )} seconds to load and may show "Not Responding" meanwhile. That is normal.</p>`
        : ""
    }
    <p class="guide-section">Leaving the game</p>
    <p class="note">${escapeHtml(
      g.howToQuit || "Press Escape to leave the game or exit to the menu (Alt+F4 also works)."
    )}</p>
    ${
      g.address
        ? `<p class="guide-section">Party server</p>
           <div class="binding"><code>${escapeHtml(g.address)}</code><button class="tab" id="guide-copy">Copy</button></div>`
        : ""
    }
    ${connectSteps.length ? `<p class="guide-section">Connecting in game</p>${stepsHtml(connectSteps)}` : ""}
    ${guideControlsHtml(g)}
    ${firstPlay.length ? `<p class="guide-section">Quick tips</p>${stepsHtml(firstPlay)}` : ""}
    <p class="hint">Esc to close</p>
  `;

  root.querySelectorAll("[data-scheme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.guideScheme = btn.dataset.scheme;
      render();
    });
  });
  const copy = document.getElementById("guide-copy");
  copy?.addEventListener("click", async () => {
    if (!window.playbound?.clipboardWrite) return;
    await window.playbound.clipboardWrite(g.address);
    copy.textContent = "Copied";
  });
}

function renderTabs() {
  tabsEl.innerHTML = `
    <button class="tab ${state.activeTab === "game" ? "active" : ""}" data-tab="game">Game</button>
    <button class="tab ${state.activeTab === "server" ? "active" : ""}" data-tab="server">Server</button>
    <button class="tab ${state.activeTab === "controls" ? "active" : ""}" data-tab="controls">Controller</button>
  `;
  tabsEl.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTab = btn.dataset.tab;
      render();
    });
  });
}

function render() {
  renderTabs();
  if (state.activeTab === "controls") renderControlsTab();
  else if (state.activeTab === "game") renderGameTab();
  else renderServerTab();
}

async function loadTes3mpClaim() {
  if (!state.partyId || !window.playbound?.getTes3mpClaimAdmin) {
    state.tes3mp = null;
    return;
  }
  if (state.data?.gameSlug !== "morrowind" || state.data?.phase === "pre-launch") {
    state.tes3mp = null;
    return;
  }
  const tes3mp = await window.playbound.getTes3mpClaimAdmin(state.partyId);
  state.tes3mp = tes3mp?.error && !tes3mp.accounts ? { accounts: [], error: tes3mp.error } : tes3mp;
  if (!state.tes3mpAccount && Array.isArray(tes3mp?.accounts) && tes3mp.accounts.length === 1) {
    state.tes3mpAccount = tes3mp.accounts[0].accountName;
  }
}

async function claimTes3mp() {
  if (!state.partyId || state.tes3mpBusy) return;
  state.tes3mpBusy = true;
  state.error = null;
  state.notice = null;
  render();
  const accountName =
    state.tes3mpAccount ||
    (state.tes3mp?.accounts?.length === 1 ? state.tes3mp.accounts[0].accountName : "");
  const result = await window.playbound.claimTes3mpAdmin(state.partyId, accountName || null);
  state.tes3mpBusy = false;
  if (!result || result.error) {
    state.error = result?.error || "Could not claim admin";
    if (Array.isArray(result?.accounts)) state.tes3mp = { ...state.tes3mp, accounts: result.accounts };
  } else {
    state.notice = `TES3MP admin linked to ${result.accountName || "your account"}. Move once in-game if commands are not live yet.`;
    state.tes3mp = {
      ...(state.tes3mp || {}),
      accounts: result.accounts || state.tes3mp?.accounts || [],
      adminAccount: result.adminAccount || result.accountName,
    };
  }
  render();
}

async function setTes3mpHour() {
  if (!state.partyId || state.tes3mpHourBusy || !window.playbound?.setTes3mpHour) return;
  state.tes3mpHourBusy = true;
  state.error = null;
  state.notice = null;
  render();
  const result = await window.playbound.setTes3mpHour(state.partyId, Number(state.tes3mpHour));
  state.tes3mpHourBusy = false;
  if (!result || result.error) {
    state.error = result?.error || "Could not set hour";
  } else {
    state.notice = `Time of day set to hour ${result.hour}. Move once in-game if it has not updated yet.`;
  }
  render();
}

async function load() {
  /*
   * A window whose preload failed to load would otherwise sit on "Loading…"
   * forever, over a game, with no way to tell that from a slow request.
   */
  if (!window.playbound?.getOverlayContext) {
    state.data = { error: "The overlay could not reach PlayBound. Restart the launcher." };
    render();
    return;
  }
  const context = await window.playbound.getOverlayContext();
  const party = context?.party || null;
  state.partyId = party?.id || null;
  state.controls = context?.controls || null;
  state.guide = context?.guide || null;
  subject.textContent =
    party?.gameTitle || party?.gameSlug || state.controls?.gameTitle || state.guide?.title || "";

  // Pick a sensible default tab once, the first time context is known —
  // never on a later reload, so switching tabs mid-session sticks. The Game
  // guide is the general answer; otherwise land on whichever tab has something.
  if (!state.tabInitialized) {
    state.tabInitialized = true;
    state.activeTab = state.guide
      ? "game"
      : state.partyId
        ? "server"
        : state.controls
          ? "controls"
          : "game";
  }

  if (!state.partyId) {
    state.data = {
      error: context?.reason
        ? `Open the overlay from a game — ${context.reason}.`
        : "No party is open right now.",
    };
    render();
    return;
  }

  const data = await window.playbound.getServerSettings(state.partyId);
  state.data = data || { error: "Could not reach PlayBound" };
  state.draft = data?.supported ? { ...data.values } : {};
  state.error = null;
  render();
  if (data?.supported) {
    await loadTes3mpClaim();
    render();
  }
}

async function apply() {
  const changed = changedKeys();
  if (!changed.length) return;
  state.busy = true;
  state.error = null;
  state.notice = null;
  render();

  const settings = {};
  for (const key of changed) settings[key] = state.draft[key];
  const result = await window.playbound.applyServerSettings(state.partyId, settings);

  state.busy = false;
  if (!result || result.error) {
    state.error = result?.error || "Could not change the server";
  } else {
    if (result.rejected?.length) {
      state.error = result.rejected.map((r) => `${r.key}: ${r.reason}`).join(", ");
    }
    if (result.status?.status === "failed") {
      state.error = result.status.error || "The server did not come back up";
    } else if (result.outcome === "planned") {
      state.notice = "Saved. The server starts with these.";
    } else if (result.outcome === "restarted") {
      state.notice = "Server restarted with the new settings.";
    } else if (result.outcome === "applied-live") {
      state.notice = "Applied. Nobody was disconnected.";
    }
  }
  await load();
}

document.getElementById("close").addEventListener("click", () => {
  void window.playbound?.hideOverlay();
});

/*
 * Escape closes, because the overlay is over a game someone is playing and the
 * fastest way out has to be the one every other overlay already taught them.
 */
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") void window.playbound?.hideOverlay();
});

// Re-read on each open rather than polling: a hidden overlay asking the server
// what the map is every few seconds is cost with nobody watching it.
if (window.playbound?.onOverlayOpened) window.playbound.onOverlayOpened(() => void load());
void load();
