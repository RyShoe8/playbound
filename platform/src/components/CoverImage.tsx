"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

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
  const remote = /^https?:\/\//i.test(src);
  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized={remote}
      className={cn("object-cover", className)}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}
