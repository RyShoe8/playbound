"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

function PopoutDetectorInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const isPopout = searchParams?.get("popout") === "true";
    // QR / deep links use /c/{CODE}; legacy /controller still works.
    // Without this, cleanup removed is-controller-pwa that /c/layout set,
    // and the pad rendered inside the full site chrome (mixed stream page).
    const isController =
      typeof pathname === "string" &&
      (pathname === "/c" ||
        pathname.startsWith("/c/") ||
        pathname === "/controller" ||
        pathname.startsWith("/controller/"));

    document.body.classList.toggle("is-popout", isPopout);
    document.body.classList.toggle("is-controller-pwa", isController);

    return () => {
      if (!isController) {
        document.body.classList.remove("is-controller-pwa");
      }
    };
  }, [searchParams, pathname]);

  return null;
}

export function PopoutDetector() {
  return (
    <Suspense fallback={null}>
      <PopoutDetectorInner />
    </Suspense>
  );
}
