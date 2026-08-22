import { PremiumSelect } from "@/components/ui/PremiumSelect";
import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { MobileNav } from "@/components/shell/MobileNav";
import { Footer } from "@/components/shell/Footer";
import { SessionProvider } from "@/components/SessionProvider";
import { PresenceProvider } from "@/components/PresenceProvider";
import { PartySyncProvider } from "@/components/PartySyncProvider";
import { JsonLd, graph, organizationSchema, websiteSchema } from "@/components/JsonLd";
import { TelemetryProvider } from "@/components/TelemetryProvider";
import { CompatibilityShell } from "@/components/CompatibilityShell";
import { PopoutDetector } from "@/components/PopoutDetector";
import { gameAccessTiers } from "@/lib/access/tiers";
import {
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  IS_PRODUCTION,
} from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * metadataBase is hardcoded to the canonical origin rather than derived from
 * NEXTAUTH_URL / VERCEL_URL. Deriving it leaked the preview host
 * (playbound-five.vercel.app) into every og:url and canonical on production,
 * telling crawlers the wrong domain was authoritative.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  /*
   * No `alternates` here on purpose — the homepage sets its own in app/page.tsx.
   *
   * Metadata is inherited key by key, so a canonical defined at the root is
   * adopted by every page that does not set one, and those pages then declare
   * the homepage to be their canonical version. Nine indexable routes were
   * doing exactly that, /free-games and the whole /gear section among them.
   *
   * Leaving it off means a page that forgets its canonical emits none, and a
   * crawler self-canonicalizes to the URL it requested. Both are mistakes; only
   * one of them deindexes the page.
   */
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: IS_PRODUCTION,
    follow: IS_PRODUCTION,
    googleBot: {
      index: IS_PRODUCTION,
      follow: IS_PRODUCTION,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

/** Cookie-Script CMP — public ID, same class as GA measurement ID. */
const COOKIE_SCRIPT_SRC =
  "https://cdn.cookie-script.com/s/cd597c788ebcfd74bbccb96157b11d6b.js";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const accessTiers = await gameAccessTiers();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Impact.com partner verification. Uses value= per their spec, not the
            usual content= — do not "fix" this to match other meta tags.
            React treats `value` as a controlled DOM property (the same
            mechanism behind controlled <input>/<PremiumSelect>) rather than a plain
            attribute, so once the client hydrates it silently drops `value`
            from this node — correct in the raw SSR response (what a plain
            HTTP-fetch verifier reads), gone from the live DOM afterward. The
            inline script below is a second, React-independent copy so a
            verifier that renders JS still finds it after hydration. */}
        <meta
          name="impact-site-verification"
          {...{ value: "32cad13b-3ac1-453f-b345-41c04db444ae" }}
        />
        <script
          // Runs synchronously during initial HTML parsing, before React
          // hydrates, and creates a DOM node React never owns or touches —
          // so hydration can't strip its `value` attribute the way it does
          // the JSX-rendered tag above.
          dangerouslySetInnerHTML={{
            __html:
              'document.head.insertAdjacentHTML("afterbegin",\'<meta name="impact-site-verification" value="32cad13b-3ac1-453f-b345-41c04db444ae">\');',
          }}
        />
        {/* CMP before telemetry scripts so consent can gate tags.
            beforeInteractive is only allowed in the root layout. */}
        {IS_PRODUCTION ? (
          <Script src={COOKIE_SCRIPT_SRC} strategy="beforeInteractive" charSet="UTF-8" />
        ) : null}
      </head>
      <body className="min-h-full">
        {/* Site-wide entity graph. Present on every page so Organization and
            WebSite can be referenced by @id from page-level schema. */}
        <JsonLd data={graph(organizationSchema(), websiteSchema())} />
        <SessionProvider>
          {/* Inside SessionProvider so identify() sees the auth session.
              gaEnabled is server-decided so preview never hits production GA4. */}
          <TelemetryProvider gaEnabled={IS_PRODUCTION}>
            {/* Renders nothing; drives the presence heartbeat. Inside
                SessionProvider because presence only exists for signed-in
                users, and mounted once so only one session is ever opened. */}
            <PresenceProvider />
            <PartySyncProvider />
            <PopoutDetector />
            <CompatibilityShell accessTiers={accessTiers}>
              <div className="shell-sidebar"><Sidebar /></div>
              <div className="shell-main flex min-h-screen flex-col pb-16 lg:pb-0 lg:pl-60">
                <div className="shell-topbar"><TopBar /></div>
                <main className="flex-1">{children}</main>
                <div className="shell-footer"><Footer /></div>
              </div>
              <div className="shell-mobilenav"><MobileNav /></div>
            </CompatibilityShell>
          </TelemetryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
