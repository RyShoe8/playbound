/**
 * Default controls, per input method.
 *
 * A game page could already tell you whether a pad works; it could not tell
 * you what the buttons do. That is the question people actually arrive with —
 * "what's the key for X" is a search someone makes before they install, and
 * the answer today lives on a wiki somewhere else.
 *
 * Stored per scheme rather than as one list, because the same action has a
 * different answer on each: Morrowind's "ready weapon" is F on a keyboard and
 * a face button on a pad, and neither is the other's default.
 */

/** Input methods a game can be played with. */
export const CONTROL_SCHEMES = ["keyboard", "controller", "flightstick", "touch"] as const;
export type ControlScheme = (typeof CONTROL_SCHEMES)[number];

/** How each scheme is named in prose and headings. */
export const CONTROL_SCHEME_LABELS: Record<ControlScheme, string> = {
  keyboard: "Mouse & keyboard",
  controller: "Controller",
  flightstick: "Flightstick",
  touch: "Touch",
};

/**
 * Short, human descriptions used as the section intro on the controls page.
 *
 * Written for a reader who landed here from a search rather than from the
 * game page, so each says what the scheme is before listing its bindings.
 */
export const CONTROL_SCHEME_BLURBS: Record<ControlScheme, string> = {
  keyboard: "Default keyboard and mouse bindings.",
  controller: "Default gamepad layout, using the standard face-button names.",
  flightstick: "Default stick, throttle and hat bindings.",
  touch: "Default touch and on-screen controls.",
};

/**
 * Grouping for a binding, so a long list reads as sections.
 *
 * A closed set rather than free text: these become headings, and "Movement"
 * and "movement " and "Moving" would otherwise all appear as separate groups
 * on the same page.
 */
export const CONTROL_GROUPS = [
  "Movement",
  "Camera",
  "Combat",
  "Interaction",
  "Inventory",
  "Interface",
  "Multiplayer",
  "Vehicle",
  "Flight",
  "Building",
  "Other",
] as const;
export type ControlGroup = (typeof CONTROL_GROUPS)[number];

/** One action and the input bound to it by default. */
export type ControlBinding = {
  /** What it does, in the game's own words where possible: "Ready weapon". */
  action: string;
  /** The default input: "F", "Left Mouse", "A / Cross", "Hat up". */
  input: string;
  group?: ControlGroup;
  /** A caveat that only applies to this binding. */
  note?: string;
};

/** Everything known about one input method for one game. */
export type ControlSchemeBlock = {
  scheme: ControlScheme;
  /**
   * Whether the game supports this input method at all.
   *
   * Kept separate from "we have no bindings written down yet", because those
   * are different answers to the reader's question. A game that cannot be
   * played on a pad should say so; one we simply have not documented should
   * not claim anything.
   */
  supported: boolean;
  bindings: ControlBinding[];
  /**
   * A caveat covering the whole scheme — the place for things a bindings
   * table cannot express. YSoccer's D-pad is the case that prompted it: the
   * engine never reads it, so no binding list is wrong, and no binding list
   * explains why the pad half-works either.
   */
  notes?: string;
  /** Where these came from, so a reader can check and we can re-verify. */
  sourceUrl?: string;
  sourceLabel?: string;
  /** Whether a person confirmed these against the game, not just a wiki. */
  verified?: boolean;
};

export type GameControls = {
  schemes: ControlSchemeBlock[];
  /** Anything that applies across every scheme: remapping, config file paths. */
  notes?: string;
};

/** Schemes with something to show, in the order they should be presented. */
export function documentedSchemes(controls: GameControls | null | undefined): ControlSchemeBlock[] {
  if (!controls?.schemes?.length) return [];
  const order = new Map(CONTROL_SCHEMES.map((s, i) => [s, i]));
  return controls.schemes
    .filter((s) => s && (s.bindings?.length > 0 || s.notes || s.supported === false))
    .sort((a, b) => (order.get(a.scheme) ?? 99) - (order.get(b.scheme) ?? 99));
}

/** True when there is enough to justify a controls page for this game. */
export function hasControls(controls: GameControls | null | undefined): boolean {
  return documentedSchemes(controls).some((s) => s.bindings?.length > 0);
}

/** Bindings grouped for display, preserving the order groups are declared in. */
export function groupBindings(bindings: ControlBinding[]): Array<{
  group: ControlGroup;
  bindings: ControlBinding[];
}> {
  const buckets = new Map<ControlGroup, ControlBinding[]>();
  for (const b of bindings) {
    const g = (b.group || "Other") as ControlGroup;
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g)!.push(b);
  }
  return CONTROL_GROUPS.filter((g) => buckets.has(g)).map((g) => ({
    group: g,
    bindings: buckets.get(g)!,
  }));
}
