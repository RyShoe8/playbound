/**
 * The in-game overlay's server panel.
 *
 * Renders from the game's declared settings, exactly like the party window on
 * the site — no game is named anywhere in this file. The definitions, the apply
 * modes and the reasons a control is absent all come from
 * /api/parties/:id/server-settings; see docs/server-control.md.
 */

const root = document.getElementById("root");
const subject = document.getElementById("subject");

let state = { data: null, draft: {}, partyId: null, busy: false, error: null, notice: null };

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

function render() {
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

  root.innerHTML = `
    <p class="note">${escapeHtml(statusLine)}</p>
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
  subject.textContent = party?.gameTitle || party?.gameSlug || "";

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
