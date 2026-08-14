/**
 * Provider registry — one-stop shop for getting adapters.
 */

import type { StoreSlug } from "../types";
import type { StoreProviderAdapter } from "./types";
import { EpicProviderAdapter } from "./epic";
import { SteamProviderAdapter } from "./steam";
import { GogProviderAdapter } from "./gog";
import { PrimeGamingProviderAdapter } from "./primeGaming";

const adapters: Record<StoreSlug, StoreProviderAdapter> = {
  epic: new EpicProviderAdapter(),
  steam: new SteamProviderAdapter(),
  gog: new GogProviderAdapter(),
  prime_gaming: new PrimeGamingProviderAdapter(),
};

export function getProvider(store: StoreSlug): StoreProviderAdapter {
  return adapters[store];
}

export function getAllProviders(): StoreProviderAdapter[] {
  return Object.values(adapters);
}

export type { StoreProviderAdapter, DiscoveredOffer } from "./types";
