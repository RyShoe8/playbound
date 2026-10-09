"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { canOptimizeImage } from "@/lib/imageHosts";

/** Next/Image that disappears on a dead URL so the gradient behind it shows. */
export function CoverImage({
  src,
  alt,
  className,
  sizes,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      // Only hosts next.config allowlists can be optimized; anything else has
      // to bypass the optimizer or next/image rejects the request.
      unoptimized={!canOptimizeImage(src)}
      className={cn("object-cover", className)}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}
