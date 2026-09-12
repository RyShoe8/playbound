import React, { SelectHTMLAttributes, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search } from "lucide-react";

export type PremiumSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  searchable?: boolean;
};

export function PremiumSelect({
  children,
  className,
  value,
  onChange,
  disabled,
  searchable,
  ...props
}: PremiumSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /**
   * Viewport coordinates for the open menu.
   *
   * The menu used to be absolutely positioned inside this wrapper, which meant
   * it could only ever paint within its nearest stacking context — so a card
   * with `overflow-hidden`, or any later sibling that established its own
   * context, clipped it or drew over it. That is what put the Base game
   * dropdown behind the cover image on the mod editor. A portal to <body> takes
   * the menu out of that hierarchy entirely, at the cost of having to place it
   * by hand.
   */
  const [rect, setRect] = useState<{ top: number; left: number; width: number; above: boolean } | null>(
    null
  );

  const measure = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Flip upward when the menu's full height would not fit below.
    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceBelow < 260 && r.top > spaceBelow;
    setRect({
      top: above ? r.top : r.bottom,
      left: r.left,
      width: Math.max(r.width, 180),
      above,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      return;
    }
    measure();
    /*
     * Fixed positioning does not follow the button, so re-measure on anything
     * that can move it. Capture phase catches scrolling inside any ancestor,
     * not just the window.
     */
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 40);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      /*
       * The menu lives outside containerRef now, so it has to be checked
       * separately — otherwise mousedown on an option closes the menu and
       * unmounts the row before its click handler can fire, and picking an
       * option would silently do nothing.
       */
      if (containerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const options = React.Children.toArray(children)
    .map((child) => {
      if (React.isValidElement(child) && child.type === "option") {
        const optionProps = (child as React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>).props;
        return {
          value: optionProps.value !== undefined ? optionProps.value : optionProps.children,
          label: optionProps.children,
          disabled: optionProps.disabled,
        };
      }
      return null;
    })
    .filter(Boolean) as { value: string | number; label: React.ReactNode; disabled?: boolean }[];

  const showSearch = Boolean(searchable ?? (options.length > 8));

  const filteredOptions = searchQuery.trim()
    ? options.filter((opt) => {
        const q = searchQuery.toLowerCase().trim();
        const labelStr =
          typeof opt.label === "string" || typeof opt.label === "number"
            ? String(opt.label).toLowerCase()
            : "";
        const valStr = String(opt.value).toLowerCase();
        return labelStr.includes(q) || valStr.includes(q);
      })
    : options;

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
      className={`relative min-w-[120px] w-full ${wrapperClass}`}
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
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
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

      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={listboxRef}
          role="listbox"
          className="fixed z-[9999] flex flex-col max-h-64 overflow-hidden rounded-lg border border-border/60 bg-[#0B0F19]/95 p-1 text-popover-foreground shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            transformOrigin: rect.above ? "bottom" : "top",
            // Sits just clear of the button, above or below depending on room.
            transform: rect.above ? "translateY(-100%) translateY(-4px)" : "translateY(4px)",
          }}
        >
          {showSearch && (
            <div className="p-1 pb-1.5 border-b border-border/30">
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full h-8 pl-8 pr-3 text-xs rounded-md bg-secondary/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring border border-border/40"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div className="overflow-y-auto flex-1 max-h-52">
            {filteredOptions.length === 0 ? (
              <div className="py-3 px-2 text-center text-xs text-muted-foreground">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt, i) => {
                const isSelected = String(value) === String(opt.value);
                return (
                  <div
                    key={i}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      if (opt.disabled) return;
                      if (onChange) {
                        const syntheticEvent = {
                          target: { value: String(opt.value), name: props.name },
                          currentTarget: { value: String(opt.value), name: props.name },
                        } as unknown as React.ChangeEvent<HTMLSelectElement>;
                        onChange(syntheticEvent);
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
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
