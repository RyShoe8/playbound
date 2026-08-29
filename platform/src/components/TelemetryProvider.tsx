"use client";

import { Suspense, useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { telemetry } from "@/lib/telemetry";
import {
  AHREFS_KEY,
  GA_MEASUREMENT_ID,
  isTelemetryExcludedPath,
} from "@/lib/telemetry/types";
import { createGa4Provider } from "@/lib/telemetry/providers/ga4";
import { createMongoProvider } from "@/lib/telemetry/providers/mongodb";
import { createConsoleProvider } from "@/lib/telemetry/providers/console";
import { setTelemetryUserId } from "@/lib/telemetry/context";

/**
 * Loads GA4 + Ahrefs scripts, registers providers, auto page + identify.
 *
 * `gaEnabled` is decided on the server (VERCEL_ENV) so preview traffic never
 * reaches the production GA4 property. Console + Mongo still run in all envs
 * when this component is mounted.
 */
function registerProvidersOnce() {
  const providers = [createMongoProvider(), createGa4Provider()];
  if (process.env.NODE_ENV === "development") {
    providers.unshift(createConsoleProvider());
  }
  telemetry.use(providers);
}

let providersRegistered = false;

function ensureProviders() {
  if (providersRegistered) return;
  registerProvidersOnce();
  providersRegistered = true;
}

/**
 * Fires page views on App Router soft navigations.
 *
 * REQUIRED GA4 SETTING — otherwise every navigation is counted twice:
 *   Admin → Data Streams → Enhanced Measurement → Page views → advanced
 *   → UNCHECK "Page changes based on browser history events"
 */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    ensureProviders();
    if (!pathname || isTelemetryExcludedPath(pathname)) return;

    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;

    if (lastSent.current === path) return;
    lastSent.current = path;

    // Idle so page_view POSTs don't contend with App Router RSC on soft nav.
    const send = () => {
      const isWebdriver = typeof navigator !== "undefined" && Boolean(navigator.webdriver);
      void telemetry.page(path, {
        path,
        title: typeof document !== "undefined" ? document.title : undefined,
        ...(isWebdriver ? { webdriver: true } : {}),
      });
    };
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(send, { timeout: 2000 });
    } else {
      timeoutId = setTimeout(send, 200);
    }
    return () => {
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [pathname, searchParams]);

  return null;
}

function IdentifyFromSession() {
  const { data: session } = useSession();
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    ensureProviders();
    const id = session?.user?.id ?? null;
    if (!id) {
      setTelemetryUserId(null);
      lastId.current = null;
      return;
    }
    if (lastId.current === id) return;
    lastId.current = id;
    void telemetry.identify(id, {
      username: session?.user?.username ?? null,
      role: session?.user?.role ?? null,
    });
  }, [session?.user?.id, session?.user?.username, session?.user?.role]);

  return null;
}

function TelemetryScripts({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();

  if (!enabled) return null;
  if (pathname && isTelemetryExcludedPath(pathname)) return null;

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
    </>
  );
}

export function TelemetryProvider({
  children,
  gaEnabled,
}: {
  children?: React.ReactNode;
  /** Load GA4 + Ahrefs (production only). */
  gaEnabled: boolean;
}) {
  useEffect(() => {
    ensureProviders();
  }, []);

  return (
    <>
      <TelemetryScripts enabled={gaEnabled} />
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <IdentifyFromSession />
      {children}
    </>
  );
}
