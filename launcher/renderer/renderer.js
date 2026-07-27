const libraryEl = document.getElementById("library");
const libraryListEl = document.getElementById("library-list");
const libraryEmptyEl = document.getElementById("library-empty");
const libraryMsgEl = document.getElementById("library-msg");
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
const btnBackLibrary = document.getElementById("btn-back-library");
const btnBrowseSite = document.getElementById("btn-browse-site");
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

function setLibraryMsg(text, isError = false) {
  libraryMsgEl.textContent = text || "";
  libraryMsgEl.classList.toggle("err", isError);
  libraryMsgEl.classList.toggle("ok", Boolean(text) && !isError);
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
        ? `Connected. Synced ${synced} game${synced === 1 ? "" : "s"}.`
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
    const isError = data.connected === false || /reconnect|invalid|rejected|expired|issue/i.test(data.message);
    setAccountMsg(data.message, isError);
    if (!isError) accountMsgEl.classList.add("ok");
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
  for (const btn of libraryListEl.querySelectorAll("button")) btn.disabled = next;
  btnChoose.disabled = next;
}

function showLibrary() {
  libraryEl.classList.remove("hidden");
  gameEl.classList.add("hidden");
  void loadLibrary();
}

function showGame() {
  libraryEl.classList.add("hidden");
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

async function loadLibrary() {
  try {
    const games = await window.playbound.getInstalled();
    libraryListEl.replaceChildren();
    const empty = !games || games.length === 0;
    libraryEmptyEl.classList.toggle("hidden", !empty);
    if (empty) return;

    for (const game of games) {
      const row = document.createElement("div");
      row.className = "library-row";

      const tile = document.createElement("div");
      tile.className = "tile";
      tile.textContent = String(game.title || "?").charAt(0);
      tile.style.background = `linear-gradient(135deg, ${game.art[0]}, ${game.art[1]})`;

      const meta = document.createElement("div");
      meta.className = "library-row-meta";
      const name = document.createElement("strong");
      name.textContent = game.title;
      const ver = document.createElement("span");
      ver.textContent = game.version ? `v${game.version}` : "Installed";
      meta.append(name, ver);

      const actions = document.createElement("div");
      actions.className = "library-row-actions";
      actions.append(
        makeButton("Play", "btn-play btn-sm", () => void playFromLibrary(game.slug)),
        makeButton("Shortcut", "btn-site btn-sm", () => void createShortcut(game.slug)),
        makeButton("Folder", "btn-site btn-sm", () => void openGameFolder(game.dir)),
        makeButton("Uninstall", "btn-remove btn-sm", () => void uninstallFromLibrary(game))
      );

      row.append(tile, meta, actions);
      libraryListEl.append(row);
    }
  } catch (err) {
    setLibraryMsg(err.message || String(err), true);
  }
}

async function playFromLibrary(slug) {
  if (busy) return;
  setBusy(true);
  setLibraryMsg("Launching…");
  try {
    await window.playbound.play(slug);
    setLibraryMsg("Launched.");
  } catch (err) {
    setLibraryMsg(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
}

async function createShortcut(slug) {
  if (busy) return;
  setBusy(true);
  try {
    const result = await window.playbound.createShortcut(slug);
    setLibraryMsg(`Desktop shortcut created for ${result.title}.`);
  } catch (err) {
    setLibraryMsg(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
}

async function openGameFolder(dir) {
  if (!dir) {
    setLibraryMsg("Install folder not found.", true);
    return;
  }
  try {
    await window.playbound.openFolder(dir);
  } catch (err) {
    setLibraryMsg(err.message || String(err), true);
  }
}

async function uninstallFromLibrary(game) {
  if (busy) return;
  if (!confirm(`Uninstall ${game.title}? This deletes the install folder.`)) return;
  setBusy(true);
  setLibraryMsg("Uninstalling…");
  try {
    await window.playbound.uninstall(game.slug);
    setLibraryMsg(`Uninstalled ${game.title}.`);
    await loadLibrary();
  } catch (err) {
    setLibraryMsg(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
}

async function runCreateShortcut() {
  if (!ctx?.entry || busy) return;
  setBusy(true);
  try {
    const result = await window.playbound.createShortcut(ctx.entry.slug);
    setStatus(`Desktop shortcut created: ${result.title}`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
}

async function goBackToLibrary() {
  autoKey = null;
  await window.playbound.clearContext();
  showLibrary();
}

btnBackLibrary.addEventListener("click", () => void goBackToLibrary());
btnBrowseSite.addEventListener("click", () => {
  void window.playbound.openExternal("https://playbound.club/discover");
});

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
      setStatus(
        "Installer opened — finish setup in the wizard, then click Locate executable if Play is not available yet."
      );
      ctx.installerOpened = true;
      renderActions();
    } else if (result.status === "installed") {
      setStatus(`Installed ${result.version}. Ready to play — or create a desktop shortcut.`);
      ctx.installed = true;
      ctx.installedPath = result.dir;
      ctx.installerOpened = false;
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

async function runLocate() {
  if (!ctx?.entry || busy) return;
  setBusy(true);
  setStatus("Looking for the game…");
  try {
    const result = await window.playbound.locateExe(ctx.entry.slug);
    if (result.status === "cancelled") {
      setStatus("Locate cancelled.");
    } else if (result.status === "installed") {
      setStatus("Found it — ready to play.");
      ctx.installed = true;
      ctx.installedPath = result.dir;
      ctx.installerOpened = false;
      ctx.action = "play";
      renderActions();
    }
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
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
      actionsEl.append(makeButton("Back to library", "btn-site", () => void goBackToLibrary()));
      return;
    }
    if (!ctx.mod) {
      actionsEl.append(makeButton("Back to library", "btn-site", () => void goBackToLibrary()));
      return;
    }
    if (ctx.mod.downloadKind === "external") {
      actionsEl.append(
        makeButton("Open mod page", "btn-install", () => runInstallMod()),
        makeButton("Back to library", "btn-site", () => void goBackToLibrary())
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
        makeButton("Back to library", "btn-site", () => void goBackToLibrary())
      );
      return;
    }
    actionsEl.append(
      makeButton(ctx.installed ? "Reinstall mod" : "Install mod", "btn-install", () => runInstallMod()),
      makeButton("Back to library", "btn-site", () => void goBackToLibrary())
    );
    return;
  }

  if (!ctx?.entry) return;

  const entry = ctx.entry;
  if (entry.kind === "external") {
    actionsEl.append(
      makeButton("Open official site", "btn-install", () => runInstall()),
      makeButton("Back to library", "btn-site", () => void goBackToLibrary())
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
    actionsEl.append(
      makeButton("Create shortcut", "btn-site", () => void runCreateShortcut()),
      makeButton("Uninstall", "btn-remove", () => runUninstall())
    );
  } else {
    actionsEl.append(makeButton("Install", "btn-install", () => runInstall()));
    if (
      ctx.installerOpened ||
      entry.kind === "github-installer" ||
      entry.kind === "direct-installer"
    ) {
      actionsEl.append(makeButton("Locate executable", "btn-site", () => void runLocate()));
    }
  }

  actionsEl.append(makeButton("Back to library", "btn-site", () => void goBackToLibrary()));
}

function applyContext(next) {
  ctx = next;
  if (!ctx) {
    showLibrary();
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
      actionsEl.replaceChildren(makeButton("Back to library", "btn-site", () => void goBackToLibrary()));
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
    actionsEl.replaceChildren(makeButton("Back to library", "btn-site", () => void goBackToLibrary()));
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

  const showPath =
    entry.kind === "github-zip" ||
    entry.kind === "direct-zip" ||
    entry.kind === "openttd-zip" ||
    entry.kind === "direct-exe" ||
    entry.kind === "github-jar";
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
    if (ctx.installed) {
      setStatus("Already installed — choose Play or create a shortcut.");
      ctx.action = "play";
      renderActions();
    } else {
      setStatus("Starting install…");
      runInstall();
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

window.playbound.getContext().then((data) => applyContext(data));
