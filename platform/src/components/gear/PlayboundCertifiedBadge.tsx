import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PlayboundCertifiedBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-500 dark:text-amber-400",
        className
      )}
    >
      <CheckCircle2 className="size-3.5" />
      Playbound Certified
    </div>
  );
}
