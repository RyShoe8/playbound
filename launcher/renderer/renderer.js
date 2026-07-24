const gamesEl = document.getElementById("games");

/** slug -> { statusEl, barEl, buttons } for live updates */
const rows = new Map();

const fmtBytes = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`;

function setStatus(slug, text, isError = false) {
  const row = rows.get(slug);
  if (!row) return;
  row.statusEl.textContent = text;
  row.statusEl.classList.toggle("err", isError);
}

function setProgress(slug, pct) {
  const row = rows.get(slug);
  if (!row) return;
  row.progressEl.style.display = pct === null ? "none" : "block";
  if (pct !== null) row.barEl.style.width = `${pct}%`;
}

window.playbound.onProgress(({ slug, phase, received, total }) => {
  if (phase === "resolving") setStatus(slug, "Finding the latest release…");
  if (phase === "downloading") {
    const pct = total ? Math.round((received / total) * 100) : null;
    setStatus(slug, `Downloading… ${fmtBytes(received)}${total ? ` of ${fmtBytes(total)} (${pct}%)` : ""}`);
    if (pct !== null) setProgress(slug, pct);
  }
  if (phase === "extracting") {
    setStatus(slug, "Extracting…");
    setProgress(slug, 100);
  }
  if (phase === "done") setProgress(slug, null);
});

function render(entries) {
  gamesEl.replaceChildren();
  rows.clear();

  for (const g of entries) {
    const row = document.createElement("div");
    row.className = "game";

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.style.background = `linear-gradient(135deg, ${g.art[0]}, ${g.art[1]})`;
    tile.textContent = g.title.charAt(0);

    const meta = document.createElement("div");
    meta.className = "meta";
    const h2 = document.createElement("h2");
    h2.textContent = g.title;
    const p = document.createElement("p");
    p.textContent =
      g.kind === "external"
        ? (g.note ?? g.blurb)
        : `${g.blurb} · ${g.approxSize}${g.version ? ` · ${g.version} installed` : ""}`;
    const status = document.createElement("div");
    status.className = "status";
    const progress = document.createElement("div");
    progress.className = "progress";
    progress.style.display = "none";
    const bar = document.createElement("div");
    progress.appendChild(bar);
    meta.append(h2, p, status, progress);

    row.append(tile, meta);
    rows.set(g.slug, { statusEl: status, progressEl: progress, barEl: bar });

    if (g.kind === "external") {
      const btn = document.createElement("button");
      btn.className = "btn-site";
      btn.textContent = "Official Site";
      btn.onclick = () => window.playbound.openExternal(g.url);
      row.appendChild(btn);
    } else if (g.installed) {
      const play = document.createElement("button");
      play.className = "btn-play";
      play.textContent = "▶ Play";
      play.onclick = async () => {
        try {
          await window.playbound.play(g.slug);
          setStatus(g.slug, "Launched — have fun!");
        } catch (err) {
          setStatus(g.slug, String(err.message || err), true);
        }
      };
      const remove = document.createElement("button");
      remove.className = "btn-remove";
      remove.textContent = "Uninstall";
      remove.onclick = async () => {
        await window.playbound.uninstall(g.slug);
        refresh();
      };
      row.append(play, remove);
    } else {
      const install = document.createElement("button");
      install.className = "btn-install";
      install.textContent = g.kind === "github-installer" ? "Get Installer" : "Install";
      install.onclick = async () => {
        install.disabled = true;
        try {
          const result = await window.playbound.install(g.slug);
          if (result.status === "installed") {
            setStatus(g.slug, `Installed ${result.version}`);
            refresh();
          } else if (result.status === "installer-opened") {
            setStatus(g.slug, "Setup wizard opened — follow it to finish installing.");
            install.disabled = false;
          }
        } catch (err) {
          setStatus(g.slug, String(err.message || err), true);
          setProgress(g.slug, null);
          install.disabled = false;
        }
      };
      row.appendChild(install);
    }

    gamesEl.appendChild(row);
  }
}

async function refresh() {
  render(await window.playbound.catalog());
}

refresh();
