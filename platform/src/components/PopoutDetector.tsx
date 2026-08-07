"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

function PopoutDetectorInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams?.get("popout") === "true") {
      document.body.classList.add("is-popout");
    } else {
      document.body.classList.remove("is-popout");
    }
  }, [searchParams]);

  return null;
}

export function PopoutDetector() {
  return (
    <Suspense fallback={null}>
      <PopoutDetectorInner />
    </Suspense>
  );
}
