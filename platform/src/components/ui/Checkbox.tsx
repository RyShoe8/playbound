"use client";

import React, { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  containerClassName?: string;
}

export function Checkbox({
  checked = false,
  onCheckedChange,
  onChange,
  label,
  description,
  disabled = false,
  className,
  containerClassName,
  id: customId,
  ...props
}: CheckboxProps) {
  const autoId = useId();
  const id = customId || autoId;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    onChange?.(e);
    onCheckedChange?.(e.target.checked);
  };

  return (
    <label
      htmlFor={id}
      className={cn(
        "group inline-flex items-center gap-2 select-none cursor-pointer text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        containerClassName
      )}
    >
      <div className="relative flex items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <div
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-md border border-border/80 bg-secondary/50 transition-all duration-200",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
            "group-hover:border-primary/50 group-hover:bg-secondary/80",
            checked
              ? "border-primary bg-primary text-primary-foreground shadow-[0_0_10px_rgba(139,92,246,0.35)] dark:shadow-[0_0_12px_rgba(168,85,247,0.4)]"
              : "text-transparent",
            className
          )}
        >
          <Check
            className={cn(
              "size-3 stroke-[3] transition-transform duration-150",
              checked ? "scale-100 opacity-100" : "scale-50 opacity-0"
            )}
          />
        </div>
      </div>
      {(label || description) && (
        <div className="flex flex-col">
          {label && <span className="leading-tight text-foreground/90 group-hover:text-foreground">{label}</span>}
          {description && (
            <span className="text-[11px] font-normal text-muted-foreground leading-snug">
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  );
}
