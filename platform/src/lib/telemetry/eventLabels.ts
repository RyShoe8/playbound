/**
 * Display names for telemetry events.
 *
 * Event names are wire identifiers (`launcher_install`) and must never change
 * once data exists under them. Anything an admin reads should go through
 * `formatEventName` instead of printing the identifier.
 */

/** Words that should not be title-cased by the generic rule. */
const WORD_OVERRIDES: Record<string, string> = {
  id: "ID",
  ids: "IDs",
  url: "URL",
  api: "API",
  ui: "UI",
  vps: "VPS",
  exe: "EXE",
  lan: "LAN",
  gpu: "GPU",
  cpu: "CPU",
  ga4: "GA4",
  os: "OS",
  mp: "MP",
  seo: "SEO",
  cta: "CTA",
  dlc: "DLC",
  eqw: "EQW",
  java: "Java",
  openmw: "OpenMW",
  discord: "Discord",
  steam: "Steam",
  moddb: "ModDB",
};

/** Whole-name overrides where the generic rule reads badly. */
const NAME_OVERRIDES: Record<string, string> = {
  page_view: "Page View",
  launcher_install: "Launcher Install",
  launcher_connected: "Launcher Connected",
};

/** `launcher_install` → `Launcher Install`. Safe on any string. */
export function formatEventName(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "Unknown";
  if (NAME_OVERRIDES[raw]) return NAME_OVERRIDES[raw];
  return raw
    .split(/[_\-\s.:]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      return WORD_OVERRIDES[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
