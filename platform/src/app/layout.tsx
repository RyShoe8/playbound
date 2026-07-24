import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { MobileNav } from "@/components/shell/MobileNav";
import { SessionProvider } from "@/components/SessionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PlayBound — The Home of Free PC Gaming",
    template: "%s · PlayBound",
  },
  description:
    "Discover, play, and share the best free PC games. Instant browser play, one-click installs, thriving communities. Discover. Click Play. Have Fun.",
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
            <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
              PlayBound — the home of free PC gaming. Discover. Click Play. Have Fun.
            </footer>
          </div>
          <MobileNav />
        </SessionProvider>
      </body>
    </html>
  );
}
