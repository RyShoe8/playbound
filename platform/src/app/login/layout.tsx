import type { Metadata } from "next";

// The page itself is a client component and cannot export metadata, so the
// noindex directive lives here. Auth routes must never be indexed.
export const metadata: Metadata = {
  title: "Sign In",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
