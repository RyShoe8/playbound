/**
 * Read side of the recipe health signal.
 *
 * Backed by a JSON file the scheduled checker commits, not the database, so a
 * game page can ask "is this install currently working?" without a query and
 * without a chance of the check itself being what breaks the page.
 */
import report from "@/lib/data/recipeHealth.json";
import type { HealthReport } from "./check";

const health = report as HealthReport;

/** Ids of every recipe that failed its last check. */
const brokenIds = new Set(health.failures.map((f) => f.id));

export function lastCheckedAt(): Date | null {
  const d = new Date(health.checkedAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * How stale the signal is.
 *
 * A check that has not run in days is not evidence of health — it is absence of
 * evidence — so callers use this to stay quiet rather than claim a stale pass.
 */
export function checkAgeHours(now = new Date()): number | null {
  const at = lastCheckedAt();
  if (!at) return null;
  return (now.getTime() - at.getTime()) / 36e5;
}

export function isRecipeBroken(id: string): boolean {
  return brokenIds.has(id);
}

export function isGameInstallBroken(slug: string): boolean {
  return isRecipeBroken(`game:${slug}`);
}

export function isEditionInstallBroken(gameSlug: string, editionSlug: string): boolean {
  return isRecipeBroken(`edition:${gameSlug}/${editionSlug}`);
}

export function isModDownloadBroken(slug: string): boolean {
  return isRecipeBroken(`mod:${slug}`);
}

export function brokenDetail(id: string): string | null {
  return health.failures.find((f) => f.id === id)?.detail ?? null;
}

/**
 * Human freshness label, or null when we should say nothing.
 *
 * Returns null past STALE_AFTER_HOURS: claiming "verified working" off a check
 * that last ran a week ago is exactly the unearned promise this whole feature
 * exists to stop making.
 */
const STALE_AFTER_HOURS = 24 * 4;

export function verifiedLabel(now = new Date()): string | null {
  const hours = checkAgeHours(now);
  if (hours == null || hours > STALE_AFTER_HOURS || hours < 0) return null;
  if (hours < 1) return "Verified working just now";
  if (hours < 2) return "Verified working 1 hour ago";
  if (hours < 24) return `Verified working ${Math.floor(hours)} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Verified working yesterday" : `Verified working ${days} days ago`;
}

export type { HealthReport };
