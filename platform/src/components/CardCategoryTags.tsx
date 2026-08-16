import { cn } from "@/lib/utils";

/** Genre + tag chips for catalog cards (replaces OS/platform badges). */
export function CardCategoryTags({
  genres = [],
  tags = [],
  className,
  max = 4,
  size = "sm",
}: {
  genres?: string[];
  tags?: string[];
  className?: string;
  max?: number;
  size?: "sm" | "md";
}) {
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const raw of [...genres, ...tags]) {
    const label = String(raw || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(label);
    if (chips.length >= max) break;
  }
  if (chips.length === 0) return null;
  return (
    <p className={cn("flex flex-wrap gap-1", className)}>
      {chips.map((chip) => (
        <span
          key={chip}
          className={cn(
            "rounded-md border border-border/80 bg-secondary/60 px-1.5 py-0.5 font-semibold text-muted-foreground",
            size === "md" ? "text-[12px]" : "text-[10px]"
          )}
        >
          {chip}
        </span>
      ))}
    </p>
  );
}
