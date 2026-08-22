"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

function PopoutDetectorInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const isPopout = searchParams?.get("popout") === "true";
    const isController =
      typeof pathname === "string" &&
      (pathname === "/controller" || pathname.startsWith("/controller/"));

    document.body.classList.toggle("is-popout", isPopout);
    document.body.classList.toggle("is-controller-pwa", isController);

    return () => {
      document.body.classList.remove("is-controller-pwa");
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
