export type MaintenanceWindow = { enabled?: boolean; hourUTC?: number; lastDay?: string | null };

export function maintenanceDue(window: MaintenanceWindow | null | undefined, now: Date): boolean {
  return window?.enabled === true && window.hourUTC === now.getUTCHours() && window.lastDay !== now.toISOString().slice(0, 10);
}

export function maintenanceSettings(input: unknown): { enabled: boolean; hourUTC: number } | null {
  if (!input || typeof input !== "object") return null;
  const { enabled, hourUTC } = input as Record<string, unknown>;
  if (typeof enabled !== "boolean" || typeof hourUTC !== "number" || !Number.isInteger(hourUTC) || hourUTC < 0 || hourUTC > 23) return null;
  return { enabled, hourUTC };
}
