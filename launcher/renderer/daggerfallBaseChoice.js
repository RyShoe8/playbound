import { escapeHtml } from "./shared.js";

let promptTail = Promise.resolve();

function showChoice(name) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const root = document.createElement("div");
    root.className = "phone-controller-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "daggerfall-base-title");
    root.innerHTML = `
      <div class="phone-controller-sheet">
        <div class="phone-controller-header">
          <div class="phone-controller-badge">Install setup</div>
          <h2 id="daggerfall-base-title">${escapeHtml(name)} needs Daggerfall</h2>
          <p class="phone-controller-lead">The original Daggerfall game files weren’t found on this PC. PlayBound can install Bethesda’s free base game first, then continue with ${escapeHtml(name)} automatically.</p>
        </div>
        <div class="phone-controller-choices">
          <button type="button" class="phone-controller-choice-card is-featured" data-choice="base-first">
            <span class="phone-controller-choice-text">
              <span class="phone-controller-choice-title">Install both</span>
              <span class="phone-controller-choice-sub">Install the free base game, then ${escapeHtml(name)}.</span>
            </span>
          </button>
          <button type="button" class="phone-controller-choice-card" data-choice="edition-only">
            <span class="phone-controller-choice-text">
              <span class="phone-controller-choice-title">Install ${escapeHtml(name)} only</span>
              <span class="phone-controller-choice-sub">Choose this if you already have Daggerfall’s files elsewhere.</span>
            </span>
          </button>
        </div>
        <div class="phone-controller-footer">
          <button type="button" class="btn-ghost phone-controller-cancel-btn" data-choice="cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    const finish = (choice) => {
      document.removeEventListener("keydown", onKeyDown);
      root.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(choice);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish("cancel");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    root.addEventListener("click", (event) => {
      const choice = event.target.closest?.("[data-choice]")?.dataset.choice;
      if (choice) finish(choice);
      else if (event.target === root) finish("cancel");
    });
    root.querySelector('[data-choice="base-first"]')?.focus();
  });
}

/** Keep separate Daggerfall edition requests from replacing each other's modal. */
export function promptDaggerfallBaseChoice(name) {
  const next = promptTail.then(() => showChoice(name));
  promptTail = next.then(() => undefined, () => undefined);
  return next;
}
