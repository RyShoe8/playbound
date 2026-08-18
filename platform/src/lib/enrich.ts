import type { Game, GameFaq, InstallStep, QualityBar } from "@/lib/data/types";

import { isLauncherInstallable } from "@/lib/launcher";
import { sizeLabel } from "@/lib/seo";

/**
 * Derivation layer for the deeper editorial fields.
 *
 * Split deliberately in two:
 *
 *   DERIVED   — facts restated. Install steps, FAQ answers, quality-bar signals
 *               that follow from a licence or a commit date. These are safe to
 *               generate at import time because they assert nothing that is not
 *               already true in the catalog.
 *
 *   HUMAN     — judgement. The verdict, why we picked it, what it is good and
 *               bad at, the long-form case. These are never auto-filled. The
 *               whole positioning rests on the claim that a person assessed
 *               each game, and generating that text would make the claim false.
 *
 * `editorialReadiness()` enforces the split: a game cannot be published until
 * the HUMAN fields exist. See SEO-STRATEGY.md §1.1.
 */

// ─────────────────────────────────────────────────────────────
// Install steps
// ─────────────────────────────────────────────────────────────

/**
 * Minimum shape needed to derive install steps.
 *
 * Declared structurally rather than as Pick<Game, ...> because the same
 * function runs against admin payloads, where optional strings are `null`
 * rather than `undefined`. Accepting both keeps callers free of casts.
 */
export type InstallStepSource = {
  slug: string;
  title: string;
  website: string;
  githubRepo?: string | null;
  steamAppId?: string | null;
  platforms: string[];
  sizeMB: number;
  launchMethods: readonly string[];
  browserPlayable: boolean;
  launcherInstall?: Game["launcherInstall"] | null;
};

/**
 * Build a per-platform install guide from catalog facts.
 *
 * Shared by the importer (to seed `installSteps`) and by /games/[slug]/install
 * (as the runtime fallback), so both always agree.
 */
export function deriveInstallSteps(game: InstallStepSource): InstallStep[] {
  const steps: InstallStep[] = [];

  if (game.browserPlayable) {
    steps.push({
      platform: "all",
      text: `${game.title} runs directly in your web browser — there is nothing to download or install. Open the official site at ${game.website} and it starts immediately.`,
    });
    return steps;
  }

  // Narrow cast to exactly what isLauncherInstallable reads. InstallStepSource
  // carries every one of those fields; only launchMethods differs in variance.
  const launcherProbe = game as unknown as Pick<
    Game,
    "slug" | "platforms" | "launchMethods" | "browserPlayable" | "launcherInstall" | "website"
  >;

  if (isLauncherInstallable(launcherProbe)) {
    steps.push({
      platform: "all",
      text: `Install the PlayBound Launcher, then find ${game.title} and press Install. The launcher downloads the official release, unpacks it and creates a shortcut. This is the fastest route and it never uses third-party mirrors.`,
    });
  }

  steps.push({
    platform: "all",
    text: `Alternatively, download ${game.title} directly from the official site at ${game.website}. Always download from the official source — third-party mirrors of free games are a common malware vector.`,
  });

  if (game.githubRepo) {
    steps.push({
      platform: "all",
      text: `Official releases are published on GitHub at github.com/${game.githubRepo}/releases. Pick the newest stable release matching your operating system.`,
    });
  }

  if (game.steamAppId) {
    steps.push({
      platform: "all",
      text: `${game.title} is also on Steam and is free there. Open the store page and press Play Game to add it to your library.`,
      command: `steam://install/${game.steamAppId}`,
    });
  }

  const has = (needle: RegExp) => game.platforms.some((p) => needle.test(p));

  if (has(/windows/i)) {
    steps.push({
      platform: "windows",
      text: "Run the downloaded installer and follow the prompts. If Windows SmartScreen warns about an unrecognised publisher, that is normal for open-source projects without a paid code-signing certificate — choose More info, then Run anyway.",
    });
  }

  if (has(/mac/i)) {
    steps.push({
      platform: "macos",
      text: "Open the downloaded .dmg and drag the app into Applications. On first launch macOS may refuse to open it as unidentified — right-click the app and choose Open to approve it once.",
    });
  }

  if (has(/linux/i)) {
    steps.push({
      platform: "linux",
      text: "Check your distribution's package manager first, which is usually the easiest route. Otherwise download the AppImage from the official site, mark it executable and run it.",
      command: "chmod +x *.AppImage && ./*.AppImage",
    });
  }

  steps.push({
    platform: "all",
    text: `Launch the game and look at the settings menu before your first session — resolution and control defaults are worth checking. ${game.title} needs roughly ${sizeLabel(game.sizeMB)} of free disk space.`,
  });

  return steps;
}

// ─────────────────────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────────────────────

/**
 * Question-shaped answers built entirely from catalog facts.
 *
 * These mirror the real long-tail queries in SEO-STRATEGY.md §4.1 — "is X
 * free", "X system requirements", "is X still active" — and every answer is a
 * restatement of a field, so nothing here can be wrong unless the catalog is.
 */
export type FaqSource = {
  title: string;
  license: string;
  sizeMB: number;
  platforms: string[];
  steamDeck: boolean;
  launchMethods: readonly string[];
  githubRepo?: string | null;
  systemRequirements: { min: string; recommended: string };
  qualityBar?: QualityBar | null;
};

export function deriveFaq(game: FaqSource): GameFaq[] {
  const faq: GameFaq[] = [];
  const free = game.qualityBar?.genuinelyFree;

  faq.push({
    q: `Is ${game.title} free?`,
    a: `Yes. ${game.title} is released under ${game.license} and costs nothing to download or play.${
      free
        ? " It meets PlayBound's value criterion: no trial masquerading as a full game, no paywalled core content, and no paid competitive advantage. Optional cosmetics and premium extras are allowed."
        : ""
    }`,
  });

  faq.push({
    q: `How big is the ${game.title} download?`,
    a: `About ${sizeLabel(game.sizeMB)}. The minimum system requirements are ${game.systemRequirements.min}.`,
  });

  faq.push({
    q: `What platforms does ${game.title} run on?`,
    a: `${game.platforms.join(", ")}.${game.steamDeck ? " It is also Steam Deck compatible." : ""}`,
  });

  faq.push({
    q: `Do I need an account to play ${game.title}?`,
    a: `No account is required to download or play.${
      game.launchMethods.includes("server")
        ? " Some public multiplayer servers ask for a nickname or in-game lobby registration, which is handled inside the game itself."
        : ""
    }`,
  });

  if (game.qualityBar?.activelyMaintained) {
    faq.push({
      q: `Is ${game.title} still active in ${new Date().getFullYear()}?`,
      a: `Yes. ${game.title} met PlayBound's "actively maintained" criterion when last checked${
        game.qualityBar.lastVerified ? ` on ${game.qualityBar.lastVerified}` : ""
      } — it had a release or meaningful commit within the preceding twelve months.${
        game.launchMethods.includes("server")
          ? " Live server and player counts are shown on its servers page."
          : ""
      }`,
    });
  }

  if (game.launchMethods.includes("server")) {
    faq.push({
      q: `Does ${game.title} have multiplayer?`,
      a: `Yes, with public servers you can join for free. There is no subscription and no paid multiplayer tier — ${game.title} is ${game.license}.`,
    });
  }

  if (game.githubRepo) {
    faq.push({
      q: `Is ${game.title} open source?`,
      a: `Yes. The source code is published at github.com/${game.githubRepo} under ${game.license}. Open source is a nice property when it is present — it is not required to clear the PlayBound Bar.`,
    });
  }

  return faq;
}

// ─────────────────────────────────────────────────────────────
// Quality bar signals
// ─────────────────────────────────────────────────────────────

/** Recognised open-source licence identifiers (context for free/maintenance only). */
const OSI_LICENCE = /\b(GPL|LGPL|AGPL|MIT|BSD|Apache|MPL|Zlib|Unlicense|CC0|Artistic|EPL|ISC)\b/i;

export type QualityBarSignals = {
  /** Criteria that could be established from evidence. */
  derived: Partial<Pick<QualityBar, "genuinelyFree" | "activelyMaintained">>;
  /** Human-readable provenance for each derived value, shown in the admin UI. */
  evidence: string[];
  /** Criteria that need a person. */
  needsHuman: ("finished" | "standsAlone" | "highQuality" | "verdict")[];
};

/**
 * Establish what can be established. Deliberately conservative: a criterion is
 * only set true when there is positive evidence for it, and never set false on
 * absence of evidence — "we could not tell" is a different state from "no", and
 * conflating them would produce a bar that lies in the other direction.
 */
export function deriveQualityBarSignals(input: {
  license?: string | null;
  githubRepo?: string | null;
  steamIsFree?: boolean | null;
  /** ISO date of the newest upstream commit or release, if known. */
  lastUpstreamActivity?: string | null;
}): QualityBarSignals {
  const derived: QualityBarSignals["derived"] = {};
  const evidence: string[] = [];

  const openSource = Boolean(input.license && OSI_LICENCE.test(input.license));

  if (openSource) {
    evidence.push(
      `Open source: licence "${input.license}" is recognised — useful context for free/maintenance checks, not a Bar criterion on its own.`
    );
  } else if (input.githubRepo) {
    evidence.push(
      `Open source: source is on GitHub (${input.githubRepo}) but the licence "${input.license ?? "unknown"}" was not recognised — confirm by hand if relevant.`
    );
  }

  if (input.steamIsFree === true && openSource) {
    derived.genuinelyFree = true;
    evidence.push("Genuinely free: Steam reports the title as free and the licence is open source.");
  } else if (openSource) {
    derived.genuinelyFree = true;
    evidence.push(
      `Genuinely free: open-source licence "${input.license}". Confirm there is no separate paid content or monetised launcher.`
    );
  } else if (input.steamIsFree === true) {
    evidence.push(
      "Worth the cost: Steam reports free-to-play, which does NOT rule out paid competitive advantages, paywalled core content, or bait-and-switch pricing. Check the store page and in-app purchases before setting this."
    );
  } else if (input.steamIsFree === false) {
    evidence.push("Genuinely free: FAILS — Steam reports this title is paid.");
  } else {
    evidence.push("Genuinely free: could not be established automatically.");
  }

  if (input.lastUpstreamActivity) {
    const months =
      (Date.now() - new Date(input.lastUpstreamActivity).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (months <= 12) {
      derived.activelyMaintained = true;
      evidence.push(
        `Plays reliably: last upstream activity ${input.lastUpstreamActivity.slice(0, 10)} (${months.toFixed(1)} months ago) — still confirm a real play session before listing.`
      );
    } else {
      evidence.push(
        `Plays reliably: last upstream activity ${input.lastUpstreamActivity.slice(0, 10)} is ${months.toFixed(1)} months ago. Confirm a real play session by hand — inactivity is a signal, not an automatic fail.`
      );
    }
  } else {
    evidence.push(
      "Plays reliably: no upstream repository to check. Install it, play it, and record the source in editorial.ts."
    );
  }

  return {
    derived,
    evidence,
    needsHuman: ["finished", "standsAlone", "highQuality", "verdict"],
  };
}

/** A quality bar with derived criteria applied and the rest left false. */
export function draftQualityBar(signals: QualityBarSignals): QualityBar {
  return {
    genuinelyFree: signals.derived.genuinelyFree ?? false,
    finished: false,
    activelyMaintained: signals.derived.activelyMaintained ?? false,
    standsAlone: false,
    highQuality: false,
    verdict: "",
    lastVerified: new Date().toISOString().slice(0, 10),
  };
}

// ─────────────────────────────────────────────────────────────
// Suggestions (factual mappings, not judgement)
// ─────────────────────────────────────────────────────────────

/**
 * Candidate `bestFor` entries that follow mechanically from catalog facts.
 *
 * Offered to the editor as suggestions rather than written straight into the
 * field: "runs on old laptops" is a fact about the download size, but deciding
 * it is worth saying is still an editorial call.
 */
export type SuggestionSource = {
  features: string[];
  sizeMB: number;
  browserPlayable: boolean;
  steamDeck: boolean;
  platforms: string[];
  launchMethods: readonly string[];
  releaseYear: number;
};

export function suggestBestFor(game: SuggestionSource): string[] {
  const out: string[] = [];
  const f = (needle: RegExp) => game.features.some((x) => needle.test(x));

  if (game.sizeMB > 0 && game.sizeMB <= 500) {
    out.push("Old or low-spec laptops — a small download that runs on modest hardware");
  }
  if (game.browserPlayable) out.push("Playing instantly with nothing to install");
  if (f(/lan/i)) out.push("LAN parties — no accounts or internet connection needed");
  if (f(/split.?screen|hotseat/i)) out.push("Local multiplayer with several people on one machine");
  if (f(/co-?op/i)) out.push("Playing cooperatively with friends");
  if (f(/story campaign/i)) out.push("A single-player campaign you can finish");
  if (f(/mod support|custom maps|community content/i)) {
    out.push("Modding and community-made content");
  }
  if (f(/ranked ladder/i)) out.push("Competitive play with a real ranking system");
  if (f(/controller/i)) out.push("Playing on the couch with a gamepad");
  if (f(/family friendly/i)) out.push("Younger players and family play");
  if (game.steamDeck) out.push("Steam Deck");
  if (game.platforms.some((p) => /linux/i.test(p))) out.push("Linux, with a native build");

  return out;
}

/** Candidate `notFor` entries. Same reasoning as suggestBestFor. */
export function suggestNotFor(game: SuggestionSource): string[] {
  const out: string[] = [];
  const f = (needle: RegExp) => game.features.some((x) => needle.test(x));

  if (game.sizeMB >= 2000) {
    out.push(`You are short on disk space — this is a ${sizeLabel(game.sizeMB)} install`);
  }
  if (!f(/singleplayer|story campaign/i) && game.launchMethods.includes("server")) {
    out.push("You want to play alone — this is built around multiplayer");
  }
  if (!game.launchMethods.includes("server") && !f(/multiplayer/i)) {
    out.push("You want multiplayer — this is a single-player game");
  }
  if (!game.platforms.some((p) => /mac/i.test(p))) out.push("You are on macOS — there is no native build");
  if (!game.platforms.some((p) => /linux/i.test(p))) out.push("You are on Linux — there is no native build");
  if (game.releaseYear && game.releaseYear < 2010) {
    out.push("Dated presentation bothers you — this is an older game, however well maintained");
  }

  return out;
}

// ─────────────────────────────────────────────────────────────
// Publish gate
// ─────────────────────────────────────────────────────────────

export type ReadinessField = {
  key: string;
  label: string;
  /** Why publishing without it undermines the site. */
  why: string;
  done: boolean;
};

export type Readiness = {
  ready: boolean;
  fields: ReadinessField[];
  missing: string[];
};

const MIN_LONG_DESCRIPTION_WORDS = 150;

/** Nullable-tolerant, so admin payloads and catalog Games both fit. */
export type ReadinessSource = {
  qualityBar?: QualityBar | null;
  longDescription?: string | null;
  whyWePickedIt?: string | null;
  bestFor?: string[] | null;
  notFor?: string[] | null;
  faq?: GameFaq[] | null;
  installSteps?: InstallStep[] | null;
  browserPlayable?: boolean | null;
};

/**
 * Whether a game has enough human-written content to be published.
 *
 * This is the quality bar enforced in code rather than by discipline. The
 * catalog's entire value proposition is that inclusion means a person assessed
 * the game; a published entry with no assessment quietly falsifies that for
 * every other entry too.
 */
export function editorialReadiness(game: ReadinessSource): Readiness {
  const bar = game.qualityBar;
  const words = (game.longDescription ?? "").trim().split(/\s+/).filter(Boolean).length;

  const fields: ReadinessField[] = [
    {
      key: "qualityBar.verdict",
      label: "Quality bar verdict",
      why: "The quotable sentence that summarises the assessment. Without it the game page has no claim to attribute.",
      done: Boolean(bar?.verdict && bar.verdict.trim().length >= 40),
    },
    {
      key: "qualityBar.lastVerified",
      label: "Verification date",
      why: "Maintenance status has a shelf life. An undated assessment cannot be trusted or re-checked.",
      done: Boolean(bar?.lastVerified),
    },
    {
      key: "longDescription",
      label: `Long description (${MIN_LONG_DESCRIPTION_WORDS}+ words)`,
      why: `Currently ${words} words. Scraped store copy is duplicate content and will not rank; this needs to be original.`,
      done: words >= MIN_LONG_DESCRIPTION_WORDS,
    },
    {
      key: "whyWePickedIt",
      label: "Why we picked it",
      why: "The editorial rationale. This is what distinguishes PlayBound from a directory listing.",
      done: Boolean(game.whyWePickedIt && game.whyWePickedIt.trim().length >= 80),
    },
    {
      key: "bestFor",
      label: "Best for (at least 2)",
      why: "Tells a reader whether this game is for them, and answers 'who is X good for' queries.",
      done: (game.bestFor?.length ?? 0) >= 2,
    },
    {
      key: "notFor",
      label: "Not for (at least 2)",
      why: "Stated limitations are the strongest trust signal on the page. Nobody else in this niche publishes them.",
      done: (game.notFor?.length ?? 0) >= 2,
    },
    {
      key: "faq",
      label: "FAQ (at least 4)",
      why: "Drives FAQPage structured data and matches question-shaped searches. Auto-derived on import, so this should already pass.",
      done: (game.faq?.length ?? 0) >= 4,
    },
    {
      key: "installSteps",
      label: "Install steps",
      why: "Powers HowTo structured data and the install page. Auto-derived on import.",
      // deriveInstallSteps() returns exactly one step for a browser-playable
      // game — "runs in your browser, nothing to install" — and that single
      // step is complete by design, not a partial list. Requiring 2+ made
      // every browser game permanently unpublishable.
      done: game.browserPlayable
        ? (game.installSteps?.length ?? 0) >= 1
        : (game.installSteps?.length ?? 0) >= 2,
    },
  ];

  const missing = fields.filter((f) => !f.done).map((f) => f.label);
  return { ready: missing.length === 0, fields, missing };
}

// ─────────────────────────────────────────────────────────────
// Mods
// ─────────────────────────────────────────────────────────────

/** Same nullable-tolerant reasoning as InstallStepSource. */
export type ModInstallSource = {
  title: string;
  baseGameSlug: string;
  downloadKind: "github-zip" | "direct-zip" | "external";
  githubRepo?: string | null;
  directUrl?: string | null;
  website: string;
  installRelativePath: string;
  sizeMB: number;
};

export type ModFaqSource = {
  title: string;
  baseGameSlug: string;
  license: string;
  sizeMB: number;
  githubRepo?: string | null;
  downloadKind: "github-zip" | "direct-zip" | "external";
};

export function deriveModInstallSteps(
  mod: ModInstallSource,
  baseGameTitle?: string
): InstallStep[] {
  const base = baseGameTitle ?? mod.baseGameSlug;
  const steps: InstallStep[] = [];

  steps.push({
    platform: "all",
    text: `Install ${base} first if you have not already — ${mod.title} is an add-on and needs the base game.`,
  });

  steps.push({
    platform: "all",
    text: `The quickest route is the PlayBound Launcher: open ${base}, find ${mod.title} in its mods list and press Install. The launcher downloads the official release and places it in the right folder for you.`,
  });

  if (mod.downloadKind === "github-zip" && mod.githubRepo) {
    steps.push({
      platform: "all",
      text: `To install it by hand, download the latest release archive from github.com/${mod.githubRepo}/releases.`,
    });
  } else if (mod.downloadKind === "direct-zip" && mod.directUrl) {
    steps.push({
      platform: "all",
      text: `To install it by hand, download the archive directly from ${mod.directUrl}.`,
    });
  } else {
    steps.push({
      platform: "all",
      text: `${mod.title} is distributed through ${mod.website}. Follow the instructions there — some add-ons install through the base game's own content browser rather than as a file.`,
    });
  }

  if (mod.downloadKind !== "external") {
    steps.push({
      platform: "all",
      text: mod.installRelativePath
        ? `Extract the archive into the "${mod.installRelativePath}" folder inside your ${base} installation directory.`
        : `Extract the archive into your ${base} installation directory, replacing files if prompted.`,
    });
  }

  steps.push({
    platform: "all",
    text: `Start ${base} and enable ${mod.title} from the in-game mods or add-ons menu.${
      mod.sizeMB ? ` The download is roughly ${sizeLabel(mod.sizeMB)}.` : ""
    }`,
  });

  return steps;
}

export function deriveModFaq(mod: ModFaqSource, baseGameTitle?: string): GameFaq[] {
  const base = baseGameTitle ?? mod.baseGameSlug;
  const faq: GameFaq[] = [
    {
      q: `Is ${mod.title} free?`,
      a: `Yes. ${mod.title} is released under ${mod.license} and costs nothing. Neither it nor ${base} has any paid content.`,
    },
    {
      q: `What do I need to run ${mod.title}?`,
      a: `${base}, which is itself free. ${mod.title} is an add-on and will not run standalone.`,
    },
    {
      q: `How do I install ${mod.title}?`,
      a: `The PlayBound Launcher installs it in one click from ${base}'s mods list. You can also install it by hand — full steps are on this page.`,
    },
  ];

  if (mod.sizeMB) {
    faq.push({
      q: `How big is ${mod.title}?`,
      a: `Roughly ${sizeLabel(mod.sizeMB)}, on top of the base ${base} installation.`,
    });
  }

  if (mod.githubRepo) {
    faq.push({
      q: `Is ${mod.title} open source?`,
      a: `Yes. The source is published at github.com/${mod.githubRepo} under ${mod.license}.`,
    });
  }

  return faq;
}

export type ModReadiness = {
  ready: boolean;
  fields: ReadinessField[];
  missing: string[];
};

const MIN_MOD_DESCRIPTION_WORDS = 30;

export type ModReadinessSource = {
  longDescription?: string | null;
  whatItChanges?: string | null;
  installSteps?: InstallStep[] | null;
  faq?: GameFaq[] | null;
};

export function modEditorialReadiness(mod: ModReadinessSource): ModReadiness {
  const words = (mod.longDescription ?? "").trim().split(/\s+/).filter(Boolean).length;

  const fields: ReadinessField[] = [
    {
      key: "longDescription",
      label: `Long description (${MIN_MOD_DESCRIPTION_WORDS}+ words)`,
      why: `Currently ${words} words. A one-line tagline copied from the project page is duplicate content.`,
      done: words >= MIN_MOD_DESCRIPTION_WORDS,
    },
    {
      key: "whatItChanges",
      label: "What it changes",
      why: "The single most useful thing to tell someone about a mod, and the thing they actually search for.",
      done: Boolean(mod.whatItChanges && mod.whatItChanges.trim().length >= 40),
    },
    {
      key: "installSteps",
      label: "Install steps",
      why: "Powers HowTo structured data. Auto-derived on import.",
      done: (mod.installSteps?.length ?? 0) >= 2,
    },
    {
      key: "faq",
      label: "FAQ (at least 3)",
      why: "Drives FAQPage structured data. Auto-derived on import.",
      done: (mod.faq?.length ?? 0) >= 3,
    },
  ];

  const missing = fields.filter((f) => !f.done).map((f) => f.label);
  return { ready: missing.length === 0, fields, missing };
}

// ─────────────────────────────────────────────────────────────
// Save-path backfill
// ─────────────────────────────────────────────────────────────

/**
 * Fill the derivable fields if they are empty, on every save.
 *
 * Applied in the save path rather than only at import, so entries created by
 * hand, seeded, or imported before this existed all end up with install steps
 * and an FAQ. Never overwrites content that is already there — an editor's
 * rewrite always wins over the generated version.
 */
export function ensureDerivedGameFields<
  T extends InstallStepSource &
    FaqSource & { installSteps?: InstallStep[]; faq?: GameFaq[] },
>(payload: T): T {
  return {
    ...payload,
    installSteps: payload.installSteps?.length
      ? payload.installSteps
      : deriveInstallSteps(payload),
    faq: payload.faq?.length ? payload.faq : deriveFaq(payload),
  };
}

export function ensureDerivedModFields<
  T extends ModInstallSource &
    ModFaqSource & { installSteps?: InstallStep[]; faq?: GameFaq[] },
>(payload: T, baseGameTitle?: string): T {
  return {
    ...payload,
    installSteps: payload.installSteps?.length
      ? payload.installSteps
      : deriveModInstallSteps(payload, baseGameTitle),
    faq: payload.faq?.length ? payload.faq : deriveModFaq(payload, baseGameTitle),
  };
}

/**
 * Error message for a blocked publish attempt.
 *
 * Written to be actionable rather than scolding — it names the fields and the
 * reason the gate exists, because a gate whose purpose is unclear just gets
 * worked around.
 */
export function publishBlockedMessage(kind: "game" | "mod", missing: string[]): string {
  return (
    `Cannot publish this ${kind} yet — ${missing.length} field${missing.length === 1 ? "" : "s"} still need${missing.length === 1 ? "s" : ""} writing: ` +
    `${missing.join(", ")}. ` +
    `Save as a draft instead. PlayBound's whole claim is that a person assessed every listing; ` +
    `publishing an unassessed one weakens that for every other entry too.`
  );
}

// ─────────────────────────────────────────────────────────────
// Upstream activity
// ─────────────────────────────────────────────────────────────

/**
 * Newest push or release for a GitHub repo, as an ISO date.
 *
 * Used at import time to establish the "actively maintained" criterion from
 * evidence rather than assumption. Returns null on any failure — callers must
 * treat that as "unknown", never as "not maintained".
 */
export async function fetchUpstreamActivity(repo: string): Promise<string | null> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "PlayBoundAdmin/1.0",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };

  try {
    const dates: number[] = [];

    const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
      headers,
      next: { revalidate: 0 },
    });
    if (repoRes.ok) {
      const data = (await repoRes.json()) as { pushed_at?: string; archived?: boolean };
      if (data.archived) return null;
      if (data.pushed_at) dates.push(new Date(data.pushed_at).getTime());
    }

    const relRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      next: { revalidate: 0 },
    });
    if (relRes.ok) {
      const rel = (await relRes.json()) as { published_at?: string };
      if (rel.published_at) dates.push(new Date(rel.published_at).getTime());
    }

    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toISOString();
  } catch {
    return null;
  }
}
