import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { OPTIMIZED_IMAGE_HOSTS, canOptimizeImage } from "@/lib/imageHosts";

const configured = (nextConfig.images?.remotePatterns ?? [])
  .map((p) => (typeof p === "string" ? p : p.hostname))
  .filter((h): h is string => typeof h === "string" && h.length > 0);

describe("optimizable image hosts", () => {
  it("is exactly next.config's images.remotePatterns", () => {
    // CoverImage cannot import next.config, so the list is mirrored. A host
    // missing here is silently served at full size; a host missing there is
    // rejected by the optimizer and renders a blank card.
    expect([...OPTIMIZED_IMAGE_HOSTS].sort()).toEqual([...configured].sort());
  });

  it("optimizes the hosts the catalog's covers actually live on", () => {
    expect(canOptimizeImage("https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/games/x/cover.webp")).toBe(true);
    expect(canOptimizeImage("https://images.gog-statics.com/abc.jpg")).toBe(true);
    expect(canOptimizeImage("https://images-3.gog-statics.com/abc.jpg")).toBe(true);
    expect(canOptimizeImage("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1/header.jpg")).toBe(true);
  });

  it("leaves unlisted hosts unoptimized so next/image does not reject them", () => {
    expect(canOptimizeImage("https://www.openhv.net/cover.png")).toBe(false);
    expect(canOptimizeImage("http://images.gog-statics.com/abc.jpg")).toBe(false);
    expect(canOptimizeImage("not a url")).toBe(true);
    expect(canOptimizeImage("")).toBe(false);
  });

  it("treats local assets as optimizable", () => {
    expect(canOptimizeImage("/games/openra/cover.webp")).toBe(true);
  });
});
