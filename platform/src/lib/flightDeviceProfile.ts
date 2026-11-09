/**
 * Flight-device profiles, as the launcher shares them (see
 * launcher/services/flightDevices.js, which applies the same rules to what it
 * receives). A profile is a device's measured layout — which axis is the
 * throttle, which way its hat reports — and its buttons assigned to roles.
 *
 * Calibrations arrive from players' launchers, so everything is validated here
 * and only known fields with sane values are stored.
 */

export const AXIS_COUNT = 8;
export const FLIGHT_ROLES = [
  "fire", "altFire", "targetNearest", "targetReticle", "cyclePrimary", "cycleSecondary",
  "aux1", "aux2", "aux3", "aux4", "pause",
] as const;
export const HAT_DIRECTIONS = ["up", "right", "down", "left"] as const;
const AXIS_KEYS = ["stickX", "stickY", "throttle", "twist", "rocker"] as const;

type HatDirection = (typeof HAT_DIRECTIONS)[number];

export interface FlightDeviceProfile {
  id: string;
  vidPid: string;
  label: string;
  deviceType: "hotas" | "flightstick" | "throttle";
  axes: Partial<Record<(typeof AXIS_KEYS)[number], number>>;
  unusableAxes: number[];
  buttons: Record<string, number>;
  roles: Record<string, string>;
  hat: Record<HatDirection, HatDirection>;
}

const isIndex = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < max;

/** A clean profile, or null when the input does not describe a usable device. */
export function normalizeFlightProfile(raw: unknown): FlightDeviceProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const vidPid = String(r.vidPid || "").toLowerCase();
  if (!/^[0-9a-f]{4}:[0-9a-f]{4}$/.test(vidPid)) return null;

  const rawAxes = (r.axes || {}) as Record<string, unknown>;
  const axes: FlightDeviceProfile["axes"] = {};
  for (const key of AXIS_KEYS) if (isIndex(rawAxes[key], AXIS_COUNT)) axes[key] = rawAxes[key] as number;
  if (axes.stickX === undefined || axes.stickY === undefined) return null;

  const buttons: Record<string, number> = {};
  for (const [name, v] of Object.entries((r.buttons || {}) as Record<string, unknown>).slice(0, 64)) {
    if (isIndex(v, 128) && name.length <= 40) buttons[name] = v;
  }
  const roles: Record<string, string> = {};
  for (const [role, name] of Object.entries((r.roles || {}) as Record<string, unknown>)) {
    if (((FLIGHT_ROLES as readonly string[]).includes(role) || /^extra\d$/.test(role)) && typeof name === "string" && name in buttons) {
      roles[role] = name;
    }
  }
  const rawHat = (r.hat || {}) as Record<string, unknown>;
  const hat = Object.fromEntries(
    HAT_DIRECTIONS.map((d) => [d, (HAT_DIRECTIONS as readonly unknown[]).includes(rawHat[d]) ? rawHat[d] : d])
  ) as FlightDeviceProfile["hat"];
  if (new Set(Object.values(hat)).size !== HAT_DIRECTIONS.length) return null;

  const used = new Set(Object.values(axes));
  const deviceType = ["hotas", "flightstick", "throttle"].includes(String(r.deviceType))
    ? (r.deviceType as FlightDeviceProfile["deviceType"])
    : "flightstick";
  return {
    id: String(r.id || `device-${vidPid.replace(":", "-")}`).slice(0, 60),
    vidPid,
    label: String(r.label || "Flight device").slice(0, 60),
    deviceType,
    axes,
    unusableAxes: (Array.isArray(r.unusableAxes) ? r.unusableAxes : []).filter(
      (v): v is number => isIndex(v, AXIS_COUNT) && !used.has(v)
    ),
    buttons,
    roles,
    hat,
  };
}
