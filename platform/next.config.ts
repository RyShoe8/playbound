import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy.
 *
 * `script-src` still needs 'unsafe-inline' because Next streams hydration
 * payloads through inline <script> tags and GA4 needs an inline config block.
 * Moving to a nonce means generating one per request in middleware; until then
 * the value here is in constraining everything else — an injected tag still
 * cannot load code from an unlisted origin, post to one, reframe the page, or
 * rewrite <base>.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Clickjacking protection. 'self' rather than 'none' so same-origin embeds
  // (dev tooling, previews) keep working; cross-origin framing is what matters.
  "frame-ancestors 'self'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://analytics.ahrefs.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://cdn.cookie-script.com`,
  "style-src 'self' 'unsafe-inline'",
  // Game art comes from many upstream CDNs; next/image remotePatterns is the
  // real allowlist for optimized images.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://analytics.ahrefs.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://*.steamstatic.com https://steamcdn-a.akamaihd.net https://cdn.cookie-script.com https://eu.cookie-script.com https://vercel.com https://*.blob.vercel-storage.com https://*.public.blob.vercel-storage.com",
  // reCAPTCHA's challenge plus the trailer embeds produced by
  // classifyMediaUrl() in lib/mediaEmbed.ts.
  "frame-src 'self' https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
  "media-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Only meaningful over HTTPS; harmless locally.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The launcher reads these cross-origin from a desktop app.
      {
        source: "/api/launcher/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        source: "/api/telemetry",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Accept" },
        ],
      },
    ];
  },
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
      // Free-game offer imagery from store CDNs.
      { protocol: "https", hostname: "cdn1.epicgames.com" },
      { protocol: "https", hostname: "cdn2.unrealengine.com" },
      { protocol: "https", hostname: "**.unrealengine.com" },
      { protocol: "https", hostname: "images.gog-statics.com" },
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
      // App Router serves the icon at /icon (app/icon.tsx); browsers and bots
      // still request the legacy favicon paths.
      { source: "/favicon.ico", destination: "/icon", permanent: false },
      { source: "/favicon.png", destination: "/icon", permanent: false },
      { source: "/parties", destination: "/events", permanent: true },
    ];
  },
};

export default nextConfig;
