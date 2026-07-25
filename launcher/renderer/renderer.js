const emptyEl = document.getElementById("empty");
const gameEl = document.getElementById("game");
const tileEl = document.getElementById("tile");
const titleEl = document.getElementById("title");
const blurbEl = document.getElementById("blurb");
const pathRowEl = document.getElementById("path-row");
const installPathEl = document.getElementById("install-path");
const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const barEl = document.getElementById("bar");
const actionsEl = document.getElementById("actions");
const btnChoose = document.getElementById("btn-choose");
const btnCloseEmpty = document.getElementById("btn-close-empty");
const accountStatusEl = document.getElementById("account-status");
const tokenInputEl = document.getElementById("token-input");
const btnSaveToken = document.getElementById("btn-save-token");
const btnSignIn = document.getElementById("btn-sign-in");
const btnSignOut = document.getElementById("btn-sign-out");
const accountMsgEl = document.getElementById("account-msg");

/** @type {{ action: string, entry: object | null, installed: boolean, installedPath: string | null, defaultDir: string } | null} */
let ctx = null;
let targetDir = null;
let busy = false;
/** Prevents double auto-start when context is pushed twice for the same action+slug */
let autoKey = null;

const fmtBytes = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`;

function setAccountMsg(text, isError = false) {
  accountMsgEl.textContent = text || "";
  accountMsgEl.classList.toggle("err", isError);
  if (isError) accountMsgEl.classList.remove("ok");
}

async function refreshAccount() {
  try {
    const account = await window.playbound.getAccount();
    accountStatusEl.textContent = account.connected ? "Connected" : "Not connected";
    accountStatusEl.classList.toggle("on", Boolean(account.connected));
    btnSignIn.classList.toggle("hidden", Boolean(account.connected));
    btnSignOut.classList.toggle("hidden", !account.connected);
    if (account.connected) tokenInputEl.placeholder = "Paste a new token to replace";
  } catch {
    /* ignore */
  }
}

btnSignIn.addEventListener("click", async () => {
  setAccountMsg("Opening sign-in…");
  try {
    await window.playbound.signIn();
  } catch (err) {
    setAccountMsg(err.message || String(err), true);
  }
});

btnSignOut.addEventListener("click", async () => {
  try {
    await window.playbound.clearLauncherToken();
    tokenInputEl.value = "";
    setAccountMsg("Signed out. Installs still work locally.");
    await refreshAccount();
  } catch (err) {
    setAccountMsg(err.message || String(err), true);
  }
});

btnSaveToken.addEventListener("click", async () => {
  const token = tokenInputEl.value.trim();
  if (!token) {
    setAccountMsg("Paste a launcher token first.", true);
    return;
  }
  try {
    setAccountMsg("Connecting and syncing installs…");
    const result = await window.playbound.setLauncherToken(token);
    tokenInputEl.value = "";
    const synced = result?.synced || 0;
    setAccountMsg(
      synced > 0
        ? `Connected. Close this window and refresh your library page. Synced ${synced} game${synced === 1 ? "" : "s"}.`
        : "Connected. Close this window and refresh your library page."
    );
    accountMsgEl.classList.add("ok");
    await refreshAccount();
  } catch (err) {
    setAccountMsg(err.message || String(err), true);
  }
});

window.playbound.onAccount((data) => {
  if (data?.message) {
    setAccountMsg(data.message);
    accountMsgEl.classList.add("ok");
  } else if (data?.connected === false) {
    setAccountMsg("");
    accountMsgEl.classList.remove("ok");
  }
  void refreshAccount();
});

void refreshAccount();

function setStatus(text, isError = false) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("err", isError);
}

function setProgress(pct) {
  progressEl.style.display = pct === null ? "none" : "block";
  if (pct !== null) barEl.style.width = `${pct}%`;
}

function setBusy(next) {
  busy = next;
  for (const btn of actionsEl.querySelectorAll("button")) btn.disabled = next;
  btnChoose.disabled = next;
}

function showEmpty() {
  emptyEl.classList.remove("hidden");
  gameEl.classList.add("hidden");
}

function showGame() {
  emptyEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
}

function makeButton(label, className, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

async function runInstall() {
  if (!ctx?.entry || busy) return;
  const entry = ctx.entry;
  setBusy(true);
  setStatus(entry.kind === "external" ? "Opening official site…" : "Starting install…");
  try {
    const result = await window.playbound.install(entry.slug, targetDir || ctx.defaultDir);
    if (result.status === "external") {
      setStatus("Opened the official download page.");
    } else if (result.status === "installer-opened") {
      setStatus("Installer opened — finish setup in the wizard, then you can play.");
    } else if (result.status === "installed") {
      setStatus(`Installed ${result.version}. Ready to play.`);
      ctx.installed = true;
      ctx.installedPath = result.dir;
      ctx.action = "play";
      renderActions();
    }
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
    setProgress(null);
  }
}

async function runPlay(join = null) {
  if (!ctx?.entry || busy) return;
  setBusy(true);
  const target = join || ctx.join;
  if (target?.host && target?.port) {
    setStatus(`Joining ${target.host}:${target.port}…`);
    try {
      await window.playbound.clipboardWrite(`${target.host}:${target.port}`);
    } catch {
      /* ignore */
    }
  } else {
    setStatus("Launching…");
  }
  try {
    const result = await window.playbound.play(ctx.entry.slug, target);
    if (result.manualConnect) {
      setStatus(`Launched. Address copied — connect to ${target.host}:${target.port} in Multiplayer.`);
    } else if (result.connect) {
      setStatus(`Launched and connecting to ${result.connect}.`);
    } else {
      setStatus("Launched.");
    }
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
}

async function runUninstall() {
  if (!ctx?.entry || busy) return;
  if (!confirm(`Uninstall ${ctx.entry.title}? This deletes the install folder.`)) return;
  setBusy(true);
  setStatus("Uninstalling…");
  try {
    await window.playbound.uninstall(ctx.entry.slug);
    setStatus("Uninstalled.");
    ctx.installed = false;
    ctx.installedPath = null;
    ctx.action = "install";
    targetDir = ctx.defaultDir;
    installPathEl.textContent = targetDir;
    renderActions();
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
}

async function runInstallMod() {
  if (!ctx || ctx.action !== "install-mod" || busy) return;
  if (!ctx.mod) {
    setStatus(ctx.modError || "Mod details not loaded yet.", true);
    return;
  }
  setBusy(true);
  setStatus(ctx.mod.downloadKind === "external" ? "Opening mod page…" : "Installing mod…");
  try {
    const baseDir = ctx.baseInstalled ? ctx.basePath : targetDir;
    const result = await window.playbound.installMod(ctx.slug, baseDir || null);
    if (result.status === "external") {
      setStatus("Opened the mod page.");
    } else if (result.status === "installed") {
      setStatus(`Installed ${result.version} into ${result.dir}`);
      ctx.installed = true;
      ctx.installedPath = result.dir;
      ctx.baseInstalled = true;
      ctx.basePath = baseDir || ctx.basePath;
      renderActions();
    }
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
    setProgress(null);
  }
}

function renderActions() {
  actionsEl.replaceChildren();

  if (ctx?.action === "install-mod") {
    if (ctx.modError) {
      actionsEl.append(makeButton("Close", "btn-site", () => window.playbound.closeWindow()));
      return;
    }
    if (!ctx.mod) {
      actionsEl.append(makeButton("Close", "btn-site", () => window.playbound.closeWindow()));
      return;
    }
    if (ctx.mod.downloadKind === "external") {
      actionsEl.append(
        makeButton("Open mod page", "btn-install", () => runInstallMod()),
        makeButton("Close", "btn-site", () => window.playbound.closeWindow())
      );
      return;
    }
    if (!ctx.baseInstalled) {
      if (ctx.baseInCatalog && ctx.baseGameSlug) {
        actionsEl.append(
          makeButton("Install base game", "btn-install", () => {
            void window.playbound.openDeepLink(`playbound://install/${ctx.baseGameSlug}`);
          })
        );
      }
      actionsEl.append(
        makeButton("Install mod here", "btn-play", () => runInstallMod()),
        makeButton("Close", "btn-site", () => window.playbound.closeWindow())
      );
      return;
    }
    actionsEl.append(
      makeButton(ctx.installed ? "Reinstall mod" : "Install mod", "btn-install", () => runInstallMod()),
      makeButton("Close", "btn-site", () => window.playbound.closeWindow())
    );
    return;
  }

  if (!ctx?.entry) return;

  const entry = ctx.entry;
  if (entry.kind === "external") {
    actionsEl.append(
      makeButton("Open official site", "btn-install", () => runInstall()),
      makeButton("Close", "btn-site", () => window.playbound.closeWindow())
    );
    return;
  }

  if (ctx.action === "uninstall") {
    actionsEl.append(makeButton("Uninstall", "btn-remove", () => runUninstall()));
  } else if (ctx.installed) {
    if (ctx.action === "join" && ctx.join?.host) {
      actionsEl.append(makeButton("Join server", "btn-play", () => runPlay(ctx.join)));
    } else {
      actionsEl.append(makeButton("Play", "btn-play", () => runPlay()));
    }
    actionsEl.append(makeButton("Uninstall", "btn-remove", () => runUninstall()));
  } else {
    actionsEl.append(makeButton("Install", "btn-install", () => runInstall()));
  }

  actionsEl.append(makeButton("Close", "btn-site", () => window.playbound.closeWindow()));
}

function applyContext(next) {
  ctx = next;
  if (!ctx) {
    showEmpty();
    return;
  }

  if (ctx.action === "install-mod") {
    showGame();
    if (ctx.modError) {
      titleEl.textContent = ctx.slug || "Mod";
      blurbEl.textContent = "Couldn't load this mod from PlayBound.";
      tileEl.textContent = "?";
      tileEl.style.background = "#2a2733";
      pathRowEl.classList.add("hidden");
      setStatus(ctx.modError, true);
      renderActions();
      return;
    }
    if (!ctx.mod || !ctx.entry) {
      titleEl.textContent = ctx.slug || "Mod";
      blurbEl.textContent = "Loading mod details…";
      tileEl.textContent = "…";
      tileEl.style.background = "#2a2733";
      pathRowEl.classList.add("hidden");
      setStatus("Fetching mod from playbound.club…");
      actionsEl.replaceChildren(makeButton("Close", "btn-site", () => window.playbound.closeWindow()));
      return;
    }

    const entry = ctx.entry;
    titleEl.textContent = entry.title;
    blurbEl.textContent = `${entry.blurb}${entry.approxSize ? ` · ${entry.approxSize}` : ""}`;
    tileEl.textContent = entry.title.charAt(0);
    tileEl.style.background = `linear-gradient(135deg, ${entry.art[0]}, ${entry.art[1]})`;

    pathRowEl.classList.remove("hidden");
    document.querySelector(".path-label").textContent = "Game folder";
    targetDir = ctx.basePath || ctx.defaultDir;
    installPathEl.textContent = targetDir || "(choose base game folder)";

    setProgress(null);
    if (ctx.baseInstalled) {
      setStatus(
        ctx.installed
          ? "Mod already installed here — you can reinstall."
          : `Ready to install into ${ctx.basePath}`
      );
    } else {
      setStatus("Base game not detected — install it, or choose its folder, then install the mod.");
    }
    renderActions();
    return;
  }

  document.querySelector(".path-label").textContent = "Install to";

  if (!ctx.entry) {
    showGame();
    titleEl.textContent = ctx.slug || "Unknown game";
    blurbEl.textContent = "This game isn’t in the launcher catalog yet.";
    tileEl.textContent = "?";
    tileEl.style.background = "#2a2733";
    pathRowEl.classList.add("hidden");
    setStatus("Unknown game slug.", true);
    actionsEl.replaceChildren(makeButton("Close", "btn-site", () => window.playbound.closeWindow()));
    return;
  }

  showGame();
  const entry = ctx.entry;
  titleEl.textContent = entry.title;
  blurbEl.textContent =
    entry.kind === "external"
      ? entry.note || entry.blurb
      : `${entry.blurb} · ${entry.approxSize || ""}`.trim();
  tileEl.textContent = entry.title.charAt(0);
  tileEl.style.background = `linear-gradient(135deg, ${entry.art[0]}, ${entry.art[1]})`;

  const showPath = entry.kind === "github-zip" || entry.kind === "direct-zip";
  pathRowEl.classList.toggle("hidden", !showPath);
  targetDir = ctx.installedPath || ctx.defaultDir;
  installPathEl.textContent = targetDir;

  setStatus("");
  setProgress(null);
  renderActions();

  const key = `${ctx.action}:${entry.slug}`;
  if (autoKey === key) return;
  autoKey = key;

  if (ctx.action === "install") {
    if (entry.kind === "external") {
      runInstall();
    } else if (ctx.installed) {
      setStatus("Already installed — choose Play or Uninstall.");
      ctx.action = "play";
      renderActions();
    } else {
      setStatus("Choose a folder if you want, then click Install.");
    }
  } else if (ctx.action === "play") {
    if (ctx.installed) runPlay();
    else {
      setStatus("Not installed yet — choose a folder if you want, then click Install.");
      ctx.action = "install";
      renderActions();
    }
  } else if (ctx.action === "join") {
    const addr = ctx.join?.host && ctx.join?.port ? `${ctx.join.host}:${ctx.join.port}` : null;
    if (ctx.installed) {
      setStatus(addr ? `Ready to join ${addr}.` : "Ready to join.");
      runPlay(ctx.join);
    } else {
      setStatus(
        addr
          ? `Install first, then Join will connect to ${addr}.`
          : "Not installed yet — install first, then join again from the site."
      );
      ctx.action = "install";
      renderActions();
    }
  } else if (ctx.action === "uninstall") {
    setStatus("Confirm uninstall below.");
  }
}

window.playbound.onProgress(({ phase, received, total }) => {
  if (phase === "resolving") setStatus("Finding the latest release…");
  if (phase === "downloading") {
    const pct = total ? Math.round((received / total) * 100) : null;
    setStatus(`Downloading… ${fmtBytes(received)}${total ? ` of ${fmtBytes(total)} (${pct}%)` : ""}`);
    if (pct !== null) setProgress(pct);
  }
  if (phase === "extracting") {
    setStatus("Extracting…");
    setProgress(100);
  }
  if (phase === "done") setProgress(null);
});

window.playbound.onContext((data) => applyContext(data));

btnChoose.addEventListener("click", async () => {
  if (busy || !ctx) return;
  const picked = await window.playbound.chooseDirectory(targetDir || ctx.defaultDir);
  if (picked) {
    targetDir = picked;
    installPathEl.textContent = targetDir;
  }
});

btnCloseEmpty.addEventListener("click", () => window.playbound.closeWindow());

window.playbound.getContext().then((data) => applyContext(data));
