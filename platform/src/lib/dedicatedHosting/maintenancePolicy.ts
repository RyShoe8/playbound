export type MaintenanceWindow = { enabled?: boolean; hourUTC?: number; daysUTC?: number[]; lastDay?: string | null };
export const MAINTENANCE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function validDays(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 7 && value.every(day => Number.isInteger(day) && day >= 0 && day <= 6) && new Set(value).size === value.length;
}

export function maintenanceWindowMatches(window: MaintenanceWindow | null | undefined, now: Date): boolean {
  return window?.enabled === true && window.hourUTC === now.getUTCHours() &&
    (window.daysUTC === undefined || (validDays(window.daysUTC) && window.daysUTC.includes(now.getUTCDay())));
}

export function maintenanceDue(window: MaintenanceWindow | null | undefined, now: Date): boolean {
  return maintenanceWindowMatches(window, now) && window?.lastDay !== now.toISOString().slice(0, 10);
}

export function maintenanceSettings(input: unknown): { enabled: boolean; hourUTC: number; daysUTC?: number[] } | null {
  if (!input || typeof input !== "object") return null;
  const { enabled, hourUTC, daysUTC } = input as Record<string, unknown>;
  if (typeof enabled !== "boolean" || typeof hourUTC !== "number" || !Number.isInteger(hourUTC) || hourUTC < 0 || hourUTC > 23) return null;
  if (daysUTC !== undefined && !validDays(daysUTC)) return null;
  // Older launchers omit days. Preserve the saved selection on those writes.
  return { enabled, hourUTC, ...(daysUTC === undefined ? {} : { daysUTC: [...daysUTC as number[]].sort((a, b) => a - b) }) };
}

export function nextMaintenanceWindow(window: MaintenanceWindow | null | undefined, now: Date) {
  if (!window?.enabled || !Number.isInteger(window.hourUTC) || window.hourUTC! < 0 || window.hourUTC! > 23 || !Number.isFinite(now.getTime())) return null;
  for (let offset = 0; offset <= 7; offset++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, window.hourUTC));
    const end = new Date(start.getTime() + 3600_000);
    if (end > now && maintenanceDue(window, start)) return { start: start.toISOString(), end: end.toISOString() };
  }
  return null;
}
