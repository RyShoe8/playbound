/**
 * Telemetry singleton — the only surface app code should call.
 *
 * Providers are registered once (typically from TelemetryProvider) and each
 * method fans out fail-soft so one broken destination cannot crash the app.
 */

import { collectContext, mergeProperties, setTelemetryUserId } from "./context";
import type { TelemetryEventName, TelemetryEventProps } from "./events";
import type {
  IdentifyTraits,
  TelemetryProperties,
  TelemetryProvider,
} from "./types";

async function safeInvoke(
  provider: TelemetryProvider,
  method: string,
  fn: () => void | Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[telemetry] ${provider.name}.${method} failed`, err);
    }
  }
}

class Telemetry {
  private providers: TelemetryProvider[] = [];
  private registered = false;

  /** Replace the provider list (idempotent registration from React). */
  use(providers: TelemetryProvider[]): void {
    this.providers = providers.slice();
    this.registered = true;
  }

  get isReady(): boolean {
    return this.registered && this.providers.length > 0;
  }

  async track<E extends TelemetryEventName>(
    event: E,
    properties?: TelemetryEventProps<E>
  ): Promise<void>;
  async track(event: string, properties?: TelemetryProperties): Promise<void>;
  async track(event: string, properties?: TelemetryProperties): Promise<void> {
    const merged = mergeProperties(properties);
    await Promise.all(
      this.providers.map((p) =>
        safeInvoke(p, "track", () => p.track(event, merged))
      )
    );
  }

  async page(name: string, properties?: TelemetryProperties): Promise<void> {
    const merged = mergeProperties(properties, collectContext({ path: name }));
    await Promise.all(
      this.providers.map((p) =>
        safeInvoke(p, "page", () => p.page(name, merged))
      )
    );
  }

  async identify(userId: string, traits?: IdentifyTraits): Promise<void> {
    setTelemetryUserId(userId);
    const merged = mergeProperties(traits as TelemetryProperties);
    await Promise.all(
      this.providers.map((p) =>
        safeInvoke(p, "identify", () => p.identify(userId, merged))
      )
    );
  }

  async error(errorName: string, properties?: TelemetryProperties): Promise<void> {
    const merged = mergeProperties({ ...properties, errorName });
    await Promise.all(
      this.providers.map((p) =>
        safeInvoke(p, "error", () => p.error(errorName, merged))
      )
    );
  }

  async timing(
    metric: string,
    milliseconds: number,
    properties?: TelemetryProperties
  ): Promise<void> {
    const merged = mergeProperties({ ...properties, metric, milliseconds });
    await Promise.all(
      this.providers.map((p) =>
        safeInvoke(p, "timing", () => p.timing(metric, milliseconds, merged))
      )
    );
  }
}

/** App-wide singleton. Import this — never new Telemetry(). */
export const telemetry = new Telemetry();
export type { Telemetry };
