import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com" },
      { protocol: "https", hostname: "shared.akamai.steamstatic.com" },
      { protocol: "https", hostname: "steamcdn-a.akamaihd.net" },
      { protocol: "https", hostname: "opengraph.githubassets.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "repository-images.githubusercontent.com" },
      { protocol: "https", hostname: "cdn.microlink.io" },
    ],
  },
  async rewrites() {
    return [
      // Markdown mirrors for AI agents. `.md` is the extension convention
      // fetching agents look for, but Next route segments must be wholly
      // dynamic, so the real handler lives at /games/[slug]/markdown.
      { source: "/games/:slug.md", destination: "/games/:slug/markdown" },
    ];
  },
  async redirects() {
    return [
      // Collections and developers were previously redirect stubs pointing at
      // /discover. They are now real index pages; these catch stale inbound
      // links to the old anchor targets.
      { source: "/discover/collections", destination: "/collections", permanent: true },
      { source: "/discover/developers", destination: "/developers", permanent: true },
    ];
  },
};

export default nextConfig;
