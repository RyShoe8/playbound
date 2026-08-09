import type { ReactNode } from "react";
import { CompatibilityProvider } from "@/hooks/useCompatibilityFilter";

/**
 * Client-seeded device context. Intentionally does not call `headers()` —
 * that would force the root layout dynamic and slow every soft navigation.
 * `useDevice` resolves the real device on hydrate.
 */
export function CompatibilityShell({ children }: { children: ReactNode }) {
  return <CompatibilityProvider>{children}</CompatibilityProvider>;
}
