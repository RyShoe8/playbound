import Link from "next/link";
import Image from "next/image";

export function NewWordmark({ className = "" }: { className?: string }) {
  return <Link className={`new-wordmark ${className}`} href="/" aria-label="PlayBound home">
    <Image src="/brand/playbound-arcade-compact-on-dark.svg" alt="PlayBound" width={1500} height={340} unoptimized />
    <small>Discover. Play. Connect.</small>
  </Link>;
}
