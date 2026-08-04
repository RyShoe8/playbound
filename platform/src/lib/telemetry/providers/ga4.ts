import type { TelemetryProperties, TelemetryProvider } from "../types";
import { isTelemetryExcludedPath } from "../types";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function gtagAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

function currentPathExcluded(): boolean {
  if (typeof window === "undefined") return true;
  return isTelemetryExcludedPath(window.location.pathname);
}

/**
 * GA4 provider — client-only, SSR-safe, silent when gtag is unavailable.
 */
export function createGa4Provider(): TelemetryProvider {
  return {
    name: "ga4",

    track(event, properties) {
      if (!gtagAvailable() || currentPathExcluded()) return;
      const { timestamp: _t, sessionId: _s, anonymousId: _a, ...rest } =
        (properties || {}) as TelemetryProperties;
      window.gtag!("event", event, rest);
    },

    page(name, properties) {
      if (!gtagAvailable() || currentPathExcluded()) return;
      const path =
        name ||
        (typeof properties?.path === "string" ? properties.path : undefined) ||
        window.location.pathname;
      window.gtag!("event", "page_view", {
        page_path: path,
        page_location:
          (typeof properties?.url === "string" && properties.url) ||
          window.location.href,
        page_title:
          (typeof properties?.title === "string" && properties.title) ||
          document.title,
      });
    },

    identify(userId, traits) {
      if (!gtagAvailable() || currentPathExcluded()) return;
      window.gtag!("set", { user_id: userId });
      if (traits && Object.keys(traits).length) {
        const { username, role } = traits as {
          username?: string;
          role?: string;
        };
        window.gtag!("set", "user_properties", {
          ...(username ? { username } : {}),
          ...(role ? { role } : {}),
        });
      }
    },

    error(name, properties) {
      if (!gtagAvailable() || currentPathExcluded()) return;
      window.gtag!("event", "exception", {
        description: name,
        fatal: false,
        ...(properties || {}),
      });
    },

    timing(metric, ms, properties) {
      if (!gtagAvailable() || currentPathExcluded()) return;
      window.gtag!("event", "timing_complete", {
        name: metric,
        value: Math.round(ms),
        ...(properties || {}),
      });
    },
  };
}
