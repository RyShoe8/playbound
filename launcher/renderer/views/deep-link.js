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
  setProgress,
  setStatus,
  startGameSession,
  state,
  views,
} from "../shared.js";

function renderDeepLinkView(ctx) {
  if (!ctx) return;
  state.deepLinkCtx = ctx;

  const container = views.deepLink;
  const entry = ctx.entry;
  const title = entry?.title || ctx.mod?.title || ctx.slug || "Action";
  const blurb =
    entry?.blurb ||
    (ctx.action === "join" && ctx.join?.host
      ? `Join ${ctx.join.name || `${ctx.join.host}:${ctx.join.port}`}`
      : ctx.modError
        ? String(ctx.modError)
        : "");

  container.innerHTML = `
    <h1 class="view-title">PlayBound Action</h1>
    <p class="view-sub">Requested action from playbound.club</p>

    <div class="settings-group">
      <h2 style="font-size: 20px; font-weight: 800; margin-bottom: 8px">${escapeHtml(title)}</h2>
      <p class="settings-hint">${escapeHtml(blurb)}</p>
      
      <div style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;" id="dl-actions"></div>
      ${
        entry?.addons && entry.addons.length > 0 && ctx.action === "install"
          ? `<div class="detail-addons-picker" style="margin: 0.75rem 0;">
               <p style="font-weight:600; margin-bottom:0.5rem; font-size:13px; color:#a1a1aa;">Optional Downloads</p>
               ${entry.addons
                 .map(
                   (a) =>
                     `<label style="display:block; font-size:13px; margin-bottom:0.25rem; color:#e2e8f0; display:flex; align-items:flex-start; gap:0.5rem; cursor:pointer;">
                        <input type="checkbox" class="addon-checkbox" value="${escapeHtml(a.id)}" checked style="margin-top:2px;" />
                        <div>
                          <div>${escapeHtml(a.name)}</div>
                          <div style="font-size:11px; color:#a1a1aa;">${escapeHtml(a.description || "")}</div>
                        </div>
                      </label>`
                 )
                 .join("")}
             </div>`
          : ""
      }
    </div>
  `;

  const actions = document.getElementById("dl-actions");
  if (ctx.action === "install") {
    actions.innerHTML = `
      <button class="btn-primary" id="dl-act-run" disabled>Installing…</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;

    /*
     * Mods the link asked for, installed after the game rather than with it.
     *
     * They go through the same install-mod path the Mods tab uses, which needs
     * the base game present to place files into — so this can only run once
     * the game install has reported "installed". A hand-off that ends in
     * "installer-opened" (Steam and other external stores) has no game on disk
     * yet, so nothing is attempted there.
     *
     * One failing mod does not fail the rest, and none of them fail the game
     * install that already succeeded: the point of the link was to get the
     * player into the party, and a missing mod is worth reporting rather than
     * unwinding a good install over.
     */
    const installLinkedMods = async () => {
      const mods = Array.isArray(ctx.modSlugs) ? ctx.modSlugs : [];
      if (mods.length === 0) return;
      const failed = [];
      for (let i = 0; i < mods.length; i++) {
        setStatus(`Installing mod ${i + 1} of ${mods.length}…`);
        try {
          await window.playbound.installMod(mods[i], null);
        } catch (err) {
          failed.push(mods[i]);
          console.warn(`install-mod ${mods[i]} failed:`, err?.message || err);
        }
      }
      setProgress(null);
      if (failed.length) {
        setStatus(
          `Game installed. ${failed.length} mod${failed.length === 1 ? "" : "s"} could not be installed: ${failed.join(", ")}`,
          true
        );
      } else {
        setStatus(`Install complete — ${mods.length} mod${mods.length === 1 ? "" : "s"} added.`);
      }
    };

    const startInstall = async () => {
      setStatus(`Installing ${title}…`);
      try {
        const checkboxes = document.querySelectorAll(".addon-checkbox");
        const addons = Array.from(checkboxes).filter((cb) => cb.checked).map((cb) => cb.value);
        const res = await window.playbound.install(ctx.slug, null, ctx.editionSlug || null, addons);
        if (res.status === "installer-opened") {
          setStatus("Installer opened — waiting for installer to finish…");
          setProgress(null);
          api.openGameDetail(ctx.slug, "deepLink");
          return;
        }
        if (res.status === "installed") {
          setStatus("Install complete!");
          setProgress(null);
          await installLinkedMods();
        }
        api.navigateTo("library");
      } catch (err) {
        setStatus(err.message || String(err), true);
        setProgress(null);
        const btn = document.getElementById("dl-act-run");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Retry Install";
        }
      }
    };

    document.getElementById("dl-act-run")?.addEventListener("click", () => {
      void startInstall();
    });

    // Auto-start install immediately
    void startInstall();
  } else if (ctx.action === "play") {
    actions.innerHTML = `
      <button class="btn-success" id="dl-act-run">Launch Game</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;
    document.getElementById("dl-act-run").addEventListener("click", async () => {
      try {
        await window.playbound.play(ctx.slug, ctx.join, ctx.editionSlug || null);
        startGameSession(ctx.slug, title);
        api.navigateTo("home");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  } else if (ctx.action === "join") {
    const host = ctx.join?.host || "";
    const port = Number(ctx.join?.port || 0);
    actions.innerHTML = `
      <button class="btn-success" id="dl-act-run" ${host && port ? "" : "disabled"}>Join Server</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;
    document.getElementById("dl-act-run")?.addEventListener("click", async () => {
      try {
        setStatus(`Joining ${host}:${port}…`);
        await window.playbound.play(
          ctx.slug,
          { host, port, name: ctx.join?.name || "" },
          ctx.editionSlug || null
        );
        startGameSession(ctx.slug, title);
        api.navigateTo("home");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  } else if (ctx.action === "install-mod") {
    if (ctx.modError) {
      actions.innerHTML = `
        <p class="settings-hint" style="flex-basis:100%;color:#f87171;">${escapeHtml(ctx.modError)}</p>
        <button class="btn-secondary" id="dl-act-cancel">Close</button>
      `;
    } else {
      actions.innerHTML = `
        <button class="btn-primary" id="dl-act-run" disabled>Installing Mod…</button>
        <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
      `;

      const startModInstall = async () => {
        try {
          setStatus(`Installing mod ${title}…`);
          const res = await window.playbound.installMod(ctx.slug);
          if (res?.status === "needs-base-game") {
            setStatus(`Install ${res.baseGameSlug || "the base game"} first, then retry the mod.`, true);
            const btn = document.getElementById("dl-act-run");
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Retry Mod Install";
            }
            return;
          }
          setStatus("Mod installed.");
          api.navigateTo("library");
        } catch (err) {
          setStatus(err.message || String(err), true);
          const btn = document.getElementById("dl-act-run");
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Retry Mod Install";
          }
        }
      };

      document.getElementById("dl-act-run")?.addEventListener("click", () => {
        void startModInstall();
      });

      // Auto-start mod install immediately
      void startModInstall();
    }
  } else if (ctx.action === "uninstall" || ctx.action === "uninstall-mod") {
    const isMod = ctx.action === "uninstall-mod";
    actions.innerHTML = `
      <button class="btn-danger" id="dl-act-run">${isMod ? "Remove Mod" : "Uninstall"}</button>
      <button class="btn-secondary" id="dl-act-cancel">Cancel</button>
    `;
    document.getElementById("dl-act-run")?.addEventListener("click", async () => {
      try {
        setStatus(isMod ? "Removing…" : "Uninstalling…");
        if (isMod) await window.playbound.uninstallMod(ctx.slug);
        else await window.playbound.uninstall(ctx.slug, ctx.editionSlug || null);
        setStatus(isMod ? `Removed ${title}.` : `Uninstalled ${title}.`);
        await window.playbound.clearContext();
        api.navigateTo("library");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    });
  } else {
    actions.innerHTML = `
      <p class="settings-hint" style="flex-basis:100%;">This action (${escapeHtml(
        String(ctx.action || "unknown")
      )}) isn't supported in this panel. Close and try again from the launcher library.</p>
      <button class="btn-secondary" id="dl-act-cancel">Close</button>
    `;
  }

  document.getElementById("dl-act-cancel")?.addEventListener("click", async () => {
    await window.playbound.clearContext();
    api.navigateTo("home");
  });
}

api.renderDeepLinkView = renderDeepLinkView;
