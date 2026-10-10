"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { previewPagePath } from "@/lib/designPreview";
const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
const snapshot = () => previewPagePath(window.location.pathname) !== null;
const serverSnapshot = () => false;
/** Read the visible URL: Next rewrites can expose the original path through usePathname. */
export function useDesignPreview() {
  usePathname();
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
export function OriginalChrome({ children }: { children: ReactNode }) {
  return useDesignPreview() ? null : children;
}
