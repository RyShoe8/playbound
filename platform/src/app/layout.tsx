import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { MobileNav } from "@/components/shell/MobileNav";
import { Footer } from "@/components/shell/Footer";
import { SessionProvider } from "@/components/SessionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = new URL(
  process.env.NEXTAUTH_URL || "https://playbound.club",
);

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "PlayBound — The Home of Free Gaming",
    template: "%s · PlayBound",
  },
  description:
    "Discover, play, and share the best free games. Instant browser play, one-click installs, thriving communities. Discover. Click Play. Have Fun.",
  applicationName: "PlayBound",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "PlayBound",
    title: "PlayBound — The Home of Free Gaming",
    description:
      "Discover, play, and share the best free games. Instant browser play, one-click installs, thriving communities.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PlayBound — The Home of Free Gaming",
    description:
      "Discover, play, and share the best free games. Instant browser play, one-click installs, thriving communities.",
  },
};

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
        <SessionProvider>
          <Sidebar />
          <div className="flex min-h-screen flex-col pb-16 lg:pb-0 lg:pl-60">
            <TopBar />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
          <MobileNav />
        </SessionProvider>
      </body>
    </html>
  );
}
