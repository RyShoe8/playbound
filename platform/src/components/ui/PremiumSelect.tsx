import React, { SelectHTMLAttributes, useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

interface PremiumSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  // Any extra custom props can go here
}

export function PremiumSelect({ children, className, value, onChange, disabled, ...props }: PremiumSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const options = React.Children.toArray(children)
    .map((child) => {
      if (React.isValidElement(child) && child.type === "option") {
        const props = (child as React.ReactElement<any>).props;
        return {
          value: props.value !== undefined ? props.value : props.children,
          label: props.children,
          disabled: props.disabled,
        };
      }
      return null;
    })
    .filter(Boolean) as { value: string | number; label: React.ReactNode; disabled?: boolean }[];

  const selectedOption = options.find((o) => String(o.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : "Select...";

  const wrapperClass = (className || "")
    .split(/\s+/)
    .filter((c) => {
      const base = (c.split(":").pop() || "").replace(/^!/, "");
      return /^(m[trblxy]?-|w-|min-w-|max-w-|flex-|col-|row-|flex$)/.test(base);
    })
    .join(" ");

  return (
    <div
      className={`relative min-w-[120px] w-full ${wrapperClass} ${open ? "z-50" : ""}`}
      ref={containerRef}
    >
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        {...props}
      >
        {children}
      </select>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground shadow-sm backdrop-blur transition-all duration-200 hover:bg-secondary/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown
          className={`h-4 w-4 opacity-50 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          ref={listboxRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border/60 bg-[#0B0F19]/95 p-1 text-popover-foreground shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          style={{ transformOrigin: "top" }}
        >
          {options.map((opt, i) => {
            const isSelected = String(value) === String(opt.value);
            return (
              <div
                key={i}
                onClick={() => {
                  if (opt.disabled) return;
                  if (onChange) {
                    const e = { target: { value: String(opt.value), name: props.name } } as any;
                    onChange(e);
                  }
                  setOpen(false);
                }}
                className={`relative flex w-full cursor-pointer select-none items-center rounded-md py-2 pl-3 pr-8 text-sm outline-none transition-colors ${
                  opt.disabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-primary/20 hover:text-primary"
                } ${isSelected ? "bg-primary/20 text-primary font-medium" : ""}`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <span className="absolute right-2 flex h-4 w-4 items-center justify-center text-primary">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
