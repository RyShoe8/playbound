import { headers } from "next/headers";
import { CompatibilityProvider } from "@/hooks/useCompatibilityFilter";
import { deviceTypeFromUaDevice } from "@/lib/compatibility/compatibility";
import { parseUserAgent } from "@/lib/telemetry/server/parseUserAgent";

/** Server wrapper so the first client paint can seed device from User-Agent. */
export async function CompatibilityShell({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const ua = h.get("user-agent");
  const parsed = parseUserAgent(ua);
  const ssrDevice = deviceTypeFromUaDevice(parsed.device);

  return <CompatibilityProvider ssrDevice={ssrDevice}>{children}</CompatibilityProvider>;
}
