import type { ReactNode } from "react";
import { CompatibilityProvider } from "@/hooks/useCompatibilityFilter";
import { DiscoveryModeProvider } from "@/hooks/useDiscoveryMode";
import { AccessTiersProvider } from "@/components/AccessTiersProvider";
import type { GameTierMap } from "@/lib/access/tiers";

/**
 * Client-seeded device context. Intentionally does not call `headers()` —
 * that would force the root layout dynamic and slow every soft navigation.
 * `useDevice` resolves the real device on hydrate.
 *
 * Access tiers are fetched in the server layout and passed in so GameCard
 * can label price without every listing re-threading the map.
 */
export function CompatibilityShell({
  children,
  accessTiers = {},
}: {
  children: ReactNode;
  accessTiers?: GameTierMap;
}) {
  return (
    <CompatibilityProvider>
      <DiscoveryModeProvider>
        <AccessTiersProvider tiers={accessTiers}>{children}</AccessTiersProvider>
      </DiscoveryModeProvider>
    </CompatibilityProvider>
  );
}
