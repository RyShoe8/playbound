"use client";

import { Suspense, useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Google Analytics 4 and Ahrefs Web Analytics.
 *
 * Both IDs are public by nature — they ship in client-side script tags — so
 * they live here as constants rather than env vars. Move them to
 * NEXT_PUBLIC_* if you ever want per-environment properties.
 */
const GA_MEASUREMENT_ID = "G-K41GXFDWJ2";
const AHREFS_KEY = "9LCmsoftYLxkK0xA5d92ow";

/** Traffic we never want in the numbers. */
const EXCLUDED_PREFIXES = ["/admin", "/launcher/auth"];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Fires page_view on client-side navigation.
 *
 * The App Router does soft navigation, so the browser never reloads and GA4
 * sees a single pageview for an entire session unless we send them ourselves.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REQUIRED GA4 SETTING — otherwise every navigation is counted twice.
 *
 *   Admin → Data Streams → (stream) → Enhanced Measurement (cog)
 *     → Page views → Show advanced settings
 *     → UNCHECK "Page changes based on browser history events"
 *
 * `send_page_view: false` below only suppresses the *initial* pageview from
 * the config command. Enhanced Measurement's history listener is a separate
 * mechanism configured in the GA4 UI, and it will keep firing on soft
 * navigation alongside these manual events. Turning it off is what makes this
 * correct — there is no way to disable it from code.
 * ─────────────────────────────────────────────────────────────────────────
 */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || isExcluded(pathname)) return;

    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;

    // React 18 mounts effects twice in dev StrictMode; guard against sending
    // the same path twice in a row either way.
    if (lastSent.current === path) return;
    lastSent.current = path;

    window.gtag?.("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}

/**
 * `enabled` is decided on the server and passed in, because VERCEL_ENV is not
 * exposed to the client. Checking NODE_ENV here instead would report
 * "production" on preview deployments too, and preview traffic would pollute
 * the property.
 */
export function Analytics({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();

  if (!enabled) return null;
  // Don't even load the scripts for someone who lands directly on an excluded
  // route. PageViewTracker handles the case where they navigate in later.
  if (pathname && isExcluded(pathname)) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>

      <Script
        src="https://analytics.ahrefs.com/analytics.js"
        data-key={AHREFS_KEY}
        strategy="afterInteractive"
      />

      {/* useSearchParams needs a Suspense boundary or it opts the whole tree
          out of static rendering. */}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  );
}
