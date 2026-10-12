import Link from "next/link";

export function NewWordmark({ className = "" }: { className?: string }) {
  return <Link className={`new-wordmark ${className}`} href="/new">
    <span><i>▶</i>play<b>bound.</b></span>
    <small>Discover. Play. Connect.</small>
  </Link>;
}
