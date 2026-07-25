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

/** @type {{ action: string, entry: object | null, installed: boolean, installedPath: string | null, defaultDir: string } | null} */
let ctx = null;
let targetDir = null;
let busy = false;
/** Prevents double auto-start when context is pushed twice for the same action+slug */
let autoKey = null;

const fmtBytes = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`;

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

async function runPlay() {
  if (!ctx?.entry || busy) return;
  setBusy(true);
  setStatus("Launching…");
  try {
    await window.playbound.play(ctx.entry.slug);
    setStatus("Launched.");
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

function renderActions() {
  actionsEl.replaceChildren();
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
    actionsEl.append(makeButton("Play", "btn-play", () => runPlay()));
    actionsEl.append(makeButton("Uninstall", "btn-remove", () => runUninstall()));
  } else {
    actionsEl.append(makeButton("Install", "btn-install", () => runInstall()));
  }

  actionsEl.append(makeButton("Close", "btn-site", () => window.playbound.closeWindow()));
}

function applyContext(next) {
  ctx = next;
  if (!ctx || !ctx.entry) {
    if (ctx && !ctx.entry) {
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
    showEmpty();
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
