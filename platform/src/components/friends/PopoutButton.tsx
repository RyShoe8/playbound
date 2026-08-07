"use client";

import { ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PopoutButtonInner() {
  const searchParams = useSearchParams();
  const isPopout = searchParams?.get("popout") === "true";

  if (isPopout) return null;

  return (
    <button
      onClick={() =>
        window.open("/friends?popout=true", "friendsPopout", "width=350,height=750,popup=yes")
      }
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-secondary px-4 py-2 text-sm font-bold transition-all hover:bg-secondary/80"
      title="Pop out friends list into a new window"
    >
      <ExternalLink className="mr-2 size-4" />
      Pop Out
    </button>
  );
}

export function PopoutButton() {
  return (
    <Suspense fallback={null}>
      <PopoutButtonInner />
    </Suspense>
  );
}
