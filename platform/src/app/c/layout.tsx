import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Join · PlayBound Controller",
  description: "Enter the short code from the host, or scan the QR. No account required.",
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

export default function CouchJoinLayout({ children }: { children: React.ReactNode }) {
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
