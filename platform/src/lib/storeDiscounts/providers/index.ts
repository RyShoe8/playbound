import type { DiscountProviderAdapter, DiscountStoreSlug } from "../types";
import { GogDiscountAdapter } from "./gog";
import { createCheapSharkAdapter } from "./cheapshark";

const adapters: Record<DiscountStoreSlug, DiscountProviderAdapter> = {
  gog: new GogDiscountAdapter(),
  steam: createCheapSharkAdapter("steam"),
  epic: createCheapSharkAdapter("epic"),
  gamersgate: createCheapSharkAdapter("gamersgate"),
};

export function getDiscountProvider(store: DiscountStoreSlug): DiscountProviderAdapter {
  return adapters[store];
}
