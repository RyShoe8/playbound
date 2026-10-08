import type { DiscountProviderAdapter, DiscountStoreSlug } from "../types";
import { GogDiscountAdapter } from "./gog";
import { createCheapSharkAdapter } from "./cheapshark";
import { GamersGateDiscountAdapter } from "./gamersgate";

const adapters: Record<DiscountStoreSlug, DiscountProviderAdapter> = {
  gog: new GogDiscountAdapter(),
  steam: createCheapSharkAdapter("steam"),
  epic: createCheapSharkAdapter("epic"),
  gamersgate: new GamersGateDiscountAdapter(),
};

export function getDiscountProvider(store: DiscountStoreSlug): DiscountProviderAdapter {
  return adapters[store];
}
