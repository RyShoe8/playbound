import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { MobileNav } from "@/components/shell/MobileNav";
import { Footer } from "@/components/shell/Footer";
import { SessionProvider } from "@/components/SessionProvider";
import { JsonLd, graph, organizationSchema, websiteSchema } from "@/components/JsonLd";
import { Analytics } from "@/components/Analytics";
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
  alternates: { canonical: "/" },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* CMP before analytics so consent can gate tags. beforeInteractive is
            only allowed in the root layout. Production only — matches Analytics. */}
        {IS_PRODUCTION ? (
          <Script src={COOKIE_SCRIPT_SRC} strategy="beforeInteractive" charSet="UTF-8" />
        ) : null}
        {/* Site-wide entity graph. Present on every page so Organization and
            WebSite can be referenced by @id from page-level schema. */}
        <JsonLd data={graph(organizationSchema(), websiteSchema())} />
        <SessionProvider>
          <Sidebar />
          <div className="flex min-h-screen flex-col pb-16 lg:pb-0 lg:pl-60">
            <TopBar />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
          <MobileNav />
        </SessionProvider>
        {/* Production only — decided here because VERCEL_ENV is server-side,
            so preview traffic never reaches the analytics property. */}
        <Analytics enabled={IS_PRODUCTION} />
      </body>
    </html>
  );
}
