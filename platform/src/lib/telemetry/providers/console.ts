import type { TelemetryProvider } from "../types";

function print(title: string, detail: Record<string, unknown>): void {
  // Grouped console output for local development only.
  console.groupCollapsed(`%cTelemetry%c ${title}`, "color:#38bdf8;font-weight:bold", "color:inherit");
  console.log("Event:", title);
  console.log("Properties:", detail);
  console.groupEnd();
}

/**
 * Console provider — development only. Registered only when NODE_ENV=development.
 */
export function createConsoleProvider(): TelemetryProvider {
  return {
    name: "console",

    track(event, properties) {
      print(event, properties || {});
    },

    page(name, properties) {
      print(`page:${name}`, properties || {});
    },

    identify(userId, traits) {
      print("identify", { userId, ...(traits || {}) });
    },

    error(name, properties) {
      print(`error:${name}`, properties || {});
    },

    timing(metric, ms, properties) {
      print(`timing:${metric}`, { milliseconds: ms, ...(properties || {}) });
    },
  };
}
