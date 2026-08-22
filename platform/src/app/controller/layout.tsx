import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "PlayBound Controller",
  description: "Use your phone as a PlayBound controller. No account required.",
  manifest: "/controller/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "PlayBound Controller",
    statusBarStyle: "black-translucent",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0a10",
  viewportFit: "cover",
};

/** Minimal chrome; root layout shell is hidden via body.is-controller-pwa. */
export default function ControllerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: "document.body.classList.add('is-controller-pwa');",
        }}
      />
      {children}
    </>
  );
}
