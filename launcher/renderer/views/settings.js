import { createFreeOfferCard, createGameCard } from "../cards.js";
import {
  api,
  buildActivityPanelHtml,
  editionsContextSlug,
  enhanceSelect,
  escapeHtml,
  executableNoun,
  filterByCompatibility,
  gamePlayHintHtml,
  isGameDesktopCompatible,
  isMacOS,
  isModDesktopCompatible,
  selectExecutableLabel,
  setStatus,
  markViewReady,
  startGameSession,
  state,
  views,
} from "../shared.js";

let cachedHwHtml = null;

async function renderSettingsView() {
  const container = views.settings;
  try {
    state.accountState = await window.playbound.getAccount();
  } catch {
    /* keep previous */
  }
  const settings = await window.playbound.getSettings();
  const ver = window.playbound.getAppVersion
    ? await window.playbound.getAppVersion()
    : { version: settings.version, packaged: settings.packaged };
  const version = ver?.version || settings.version || "—";
  const packaged = Boolean(ver?.packaged ?? settings.packaged);
  const ready = state.updateStatus.phase === "ready";
  const canUseAdminChannel = Boolean(
    state.accountState.canUseAdminChannel || settings.canUseAdminChannel
  );
  const channelPref = settings.updateChannelPref === "latest" ? "latest" : "admin";
  const activeChannel =
    settings.updateChannel === "latest" ? "latest" : canUseAdminChannel ? "admin" : "latest";
  const updateHint = !packaged
    ? "Auto-update runs in installed builds only."
    : ready
      ? `Version ${state.updateStatus.version} downloaded.`
      : state.updateStatus.phase === "downloading"
        ? `Downloading… ${state.updateStatus.percent || 0}%`
        : ver?.updateAvailable
          ? `Update ${ver.updateAvailable.version} available.`
          : "You're on the latest build (or check to confirm).";

  container.innerHTML = `
    <h1 class="view-title">Settings</h1>
    <p class="view-sub">Manage launcher preferences and site connection.</p>

    <div class="settings-group">
      <label class="settings-label">Account</label>
      <p class="settings-hint">Sign in once — installs sync to your playbound.club library automatically.</p>
      <div style="display: flex; gap: 10px; align-items: center;">
        <span class="dot ${state.accountState.connected ? "online" : ""}"></span>
        <span style="font-size: 13px; font-weight: 600;">${
          state.accountState.connected
            ? `Signed in${state.accountState.username || state.accountState.email ? ` · ${escapeHtml(state.accountState.username || state.accountState.email)}` : ""}`
            : "Not signed in"
        }</span>
      </div>
      <div style="margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <button class="btn-primary btn-sm" id="set-btn-signin">${state.accountState.connected ? "Switch account" : "Sign in"}</button>
        ${state.accountState.connected ? '<button class="btn-danger btn-sm" id="set-btn-signout">Sign out</button>' : '<button type="button" class="btn-secondary btn-sm" id="set-btn-forgot">Forgot password</button>'}
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Default Installation Directory</label>
      <p class="settings-hint">Where games will be installed when using one-click downloads.</p>
      <input type="text" class="input-text" id="set-games-dir" value="${escapeHtml(settings.gamesDir)}" readonly />
      <div style="margin-top: 10px;">
        <button class="btn-secondary btn-sm" id="set-btn-dir">Change Directory</button>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Updates</label>
      <p class="settings-hint">Current version: <strong>${escapeHtml(version)}</strong>. <span id="set-update-hint">${escapeHtml(updateHint)}</span> First install still uses Setup from the site; later updates install in-app. Unsigned builds may show SmartScreen.</p>
      ${
        canUseAdminChannel
          ? `<div style="margin-top: 12px;">
        <p class="settings-hint" style="margin-bottom: 8px;">Update channel for testers and admins — choose which feed Check for updates uses.</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn-sm ${channelPref === "admin" ? "btn-primary" : "btn-secondary"}" data-channel="admin" id="set-channel-admin">Unsigned (testing)</button>
          <button type="button" class="btn-sm ${channelPref === "latest" ? "btn-primary" : "btn-secondary"}" data-channel="latest" id="set-channel-latest">Signed (release)</button>
        </div>
        <p class="settings-hint" style="margin-top: 8px;">Active: <strong>${escapeHtml(activeChannel === "latest" ? "signed (latest)" : "unsigned (admin)")}</strong></p>
      </div>`
          : ""
      }
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-secondary btn-sm" id="set-btn-check-update" ${packaged ? "" : "disabled"}>Check for updates</button>
        <button class="btn-primary btn-sm" id="set-btn-install-update" ${ready ? "" : "disabled"}>Install and restart</button>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Your Gaming PC</label>
      <p class="settings-hint">Used to check game compatibility on playbound.club. Synced when you sign in.</p>
      <div id="set-hw-summary" style="margin-top: 8px; font-size: 13px; line-height: 1.5; color: var(--text-muted);">Loading…</div>
      <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-secondary btn-sm" id="set-btn-hw-refresh" ${state.accountState.connected ? "" : "disabled"}>Sync now</button>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Java runtime</label>
      <p class="settings-hint">Needed for jar games like Mindustry. PlayBound can install a private Temurin JDK 17, or use Java already on your system.</p>
      <div id="set-java-status" style="margin-top: 8px; font-size: 13px; color: var(--text-muted);">Checking…</div>
      <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-secondary btn-sm" id="set-btn-java-install">Install / repair Java</button>
      </div>
    </div>

    <div class="settings-group">
      <label class="settings-label">Report a bug</label>
      <p class="settings-hint">Send a problem report to the PlayBound team. If you are signed in, it is linked to your account.</p>
      <input type="text" class="input-text" id="set-bug-title" placeholder="Short title" maxlength="160" />
      <textarea class="input-text" id="set-bug-msg" rows="4" placeholder="What happened? Steps to reproduce…" maxlength="8000"></textarea>
      <input type="email" class="input-text" id="set-bug-email" placeholder="Email (optional)" value="${escapeHtml(state.accountState.email || "")}" />
      <div style="margin-top: 10px;">
        <button class="btn-secondary btn-sm" id="set-btn-bug">Send report</button>
      </div>
    </div>
  `;

  document.getElementById("set-btn-signin").addEventListener("click", () => window.playbound.signIn());
  document.getElementById("set-btn-forgot")?.addEventListener("click", () => {
    const base = (state.accountState.apiBase || settings.apiBase || "https://playbound.club").replace(/\/$/, "");
    window.playbound.openExternal(`${base}/forgot-password`);
  });
  document.getElementById("set-btn-signout")?.addEventListener("click", async () => {
    await window.playbound.clearLauncherToken();
    api.renderSettingsView();
  });
  document.getElementById("set-btn-dir").addEventListener("click", async () => {
    const picked = await window.playbound.chooseDirectory(settings.gamesDir);
    if (picked) {
      await window.playbound.saveSettings({ gamesDir: picked });
      api.renderSettingsView();
    }
  });
  document.getElementById("set-channel-admin")?.addEventListener("click", async () => {
    await window.playbound.saveSettings({ updateChannel: "admin" });
    setStatus("Update channel: unsigned (testing)");
    api.renderSettingsView();
  });
  document.getElementById("set-channel-latest")?.addEventListener("click", async () => {
    await window.playbound.saveSettings({ updateChannel: "latest" });
    setStatus("Update channel: signed (release)");
    api.renderSettingsView();
  });

  const hwSummary = document.getElementById("set-hw-summary");
  const hwRefresh = document.getElementById("set-btn-hw-refresh");
  if (cachedHwHtml && hwSummary) {
    hwSummary.innerHTML = cachedHwHtml;
  }
  async function fillHwSummary() {
    if (!hwSummary || !window.playbound.getHardwareProfile) {
      if (hwSummary) hwSummary.textContent = "Hardware detection unavailable in this build.";
      return;
    }
    try {
      const res = await window.playbound.getHardwareProfile();
      const p = res?.profile || res?.cached;
      if (!p) {
        if (!cachedHwHtml) hwSummary.textContent = "Could not detect hardware.";
        return;
      }
      const gpu =
        p.gpus && p.primaryGpuIndex != null
          ? p.gpus[p.primaryGpuIndex]
          : p.gpus?.[0];
      const cpuLabel = p.cpu?.displayName || p.cpu?.rawName || "Unknown";
      const gpuLabel = gpu?.displayName || gpu?.rawName || "GPU not detected";
      const ram =
        p.memory?.totalMB != null
          ? p.memory.totalMB >= 1024
            ? `${Math.round(p.memory.totalMB / 1024)} GB`
            : `${p.memory.totalMB} MB`
          : "Unknown";
      const errs = Array.isArray(p.detectionErrors) ? p.detectionErrors.filter(Boolean) : [];
      cachedHwHtml = `
        <div><strong>CPU</strong> ${escapeHtml(cpuLabel)}</div>
        <div><strong>GPU</strong> ${escapeHtml(gpuLabel)}</div>
        <div><strong>Memory</strong> ${escapeHtml(ram)}</div>
        <div><strong>OS</strong> ${escapeHtml([p.os?.name || p.os?.family, p.os?.version].filter(Boolean).join(" ") || "Unknown")}</div>
        ${res?.syncedAt ? `<div style="margin-top:6px;opacity:0.8;">Last synced: ${escapeHtml(String(res.syncedAt).slice(0, 19).replace("T", " "))}</div>` : ""}
        ${
          errs.length
            ? `<div style="margin-top:8px;font-size:12px;opacity:0.75;">Notes: ${escapeHtml(errs.slice(0, 3).join("; "))}</div>`
            : ""
        }
      `;
      hwSummary.innerHTML = cachedHwHtml;
    } catch (err) {
      if (!cachedHwHtml) hwSummary.textContent = err?.message || "Detection failed.";
    }
  }
  void fillHwSummary();
  if (hwRefresh) {
    hwRefresh.onclick = async () => {
      hwRefresh.disabled = true;
      hwSummary.textContent = "Syncing…";
      try {
        const res = await window.playbound.syncHardwareProfile();
        if (res?.error) throw new Error(res.error);
        setStatus("Hardware profile synced.");
        await fillHwSummary();
      } catch (err) {
        setStatus(err?.message || "Hardware sync failed", true);
        await fillHwSummary();
      } finally {
        hwRefresh.disabled = !state.accountState.connected;
      }
    };
  }

  const javaStatus = document.getElementById("set-java-status");
  const javaBtn = document.getElementById("set-btn-java-install");
  async function fillJavaStatus() {
    if (!javaStatus) return;
    try {
      const st = window.playbound.getJavaStatus
        ? await window.playbound.getJavaStatus()
        : { managed: settings.javaRuntime, systemAvailable: false };
      const managed = st?.managed || settings.javaRuntime || {};
      if (managed.installed) {
        javaStatus.textContent = `PlayBound Java ${managed.version || "17"} installed`;
        if (javaBtn) javaBtn.textContent = "Reinstall Java";
      } else if (st?.systemAvailable || st?.usable) {
        javaStatus.textContent =
          "Using system Java (works for Mindustry). Optional: install PlayBound’s private JDK 17.";
        if (javaBtn) javaBtn.textContent = "Install PlayBound Java";
      } else {
        javaStatus.textContent = "Not found — install from here or Adoptium";
        if (javaBtn) javaBtn.textContent = "Install Java";
      }
    } catch {
      javaStatus.textContent = "Couldn’t check Java status";
    }
  }
  void fillJavaStatus();
  if (javaBtn && window.playbound.ensureManagedJava) {
    javaBtn.onclick = async () => {
      javaBtn.disabled = true;
      javaStatus.textContent = "Downloading Java 17…";
      setStatus("Installing Java 17…");
      try {
        const res = await window.playbound.ensureManagedJava({
          force: Boolean(settings.javaRuntime?.installed),
        });
        if (!res?.ok) throw new Error(res?.error || "Install failed");
        setStatus("Java 17 ready.");
        settings.javaRuntime = { installed: true, version: "17" };
        await fillJavaStatus();
      } catch (err) {
        setStatus(err?.message || "Java install failed", true);
        await fillJavaStatus();
      } finally {
        javaBtn.disabled = false;
      }
    };
  }

  document.getElementById("set-btn-check-update")?.addEventListener("click", async () => {
    const checkBtn = document.getElementById("set-btn-check-update");
    const hintEl = document.getElementById("set-update-hint");
    const installBtn = document.getElementById("set-btn-install-update");
    if (checkBtn) checkBtn.disabled = true;
    setStatus("Checking for updates…");
    const res = await window.playbound.checkForUpdates();
    if (checkBtn) checkBtn.disabled = false;
    if (!res.ok) {
      setStatus(res.message || "Update check failed", true);
      if (hintEl) hintEl.textContent = res.message || "Update check failed.";
      return;
    }
    if (res.updateAvailable) {
      setStatus(`Update ${res.version} available — downloading…`);
      state.updateStatus = { phase: "available", version: res.version };
      if (hintEl) hintEl.textContent = `Update ${res.version} available — downloading…`;
    } else if (res.behindChannel) {
      setStatus(res.message || "This build is newer than its update channel.", true);
      state.updateStatus = { phase: "none", version: res.version };
      if (hintEl) hintEl.textContent = res.message || "This build is newer than its update channel.";
    } else {
      const msg =
        res.channel === "admin"
          ? "You're up to date on the unsigned channel."
          : "You're up to date.";
      setStatus(msg);
      state.updateStatus = { phase: "none", version: res.version };
      if (hintEl) hintEl.textContent = msg;
    }
    if (installBtn) installBtn.disabled = state.updateStatus.phase !== "ready";
  });
  document.getElementById("set-btn-install-update")?.addEventListener("click", async () => {
    setStatus("Installing update and restarting…");
    await window.playbound.installUpdate();
  });
  document.getElementById("set-btn-bug")?.addEventListener("click", async () => {
    const title = document.getElementById("set-bug-title")?.value?.trim() || "";
    const description = document.getElementById("set-bug-msg")?.value?.trim() || "";
    const contactEmail = document.getElementById("set-bug-email")?.value?.trim() || "";
    if (!window.playbound.reportBug) {
      setStatus("Update the app to report bugs from Settings.", true);
      return;
    }
    setStatus("Sending bug report…");
    const res = await window.playbound.reportBug({ title, description, contactEmail });
    if (!res?.ok) {
      setStatus(res?.error || "Couldn't send report", true);
      return;
    }
    setStatus("Thanks — bug report sent.");
    const titleEl = document.getElementById("set-bug-title");
    const msgEl = document.getElementById("set-bug-msg");
    if (titleEl) titleEl.value = "";
    if (msgEl) msgEl.value = "";
  });
  markViewReady(container);
}

api.renderSettingsView = renderSettingsView;
