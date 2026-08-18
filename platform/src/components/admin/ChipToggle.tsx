"use client";

/**
 * A single on/off pill, used for picking from a fixed vocabulary.
 *
 * Shared by the game and edition editors so both classify against the same
 * lists in the same way — the edition editor previously asked for tags as
 * free text in a textarea, which meant its values drifted from the game
 * vocabulary and nothing downstream could match them.
 */
export function ChipToggle({
  label,
  on,
  onClick,
  title,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
        on
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-secondary hover:bg-secondary/70"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * A labelled group of chips over a known vocabulary, plus any values already
 * stored that are not in it.
 *
 * Those extras matter: an edition carrying a legacy free-text tag would
 * otherwise vanish from the UI while still being saved, so the editor would
 * silently misrepresent what is stored. They render as removable chips.
 */
export function ChipPicker({
  label,
  hint,
  options,
  selected,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const chosen = new Set(selected);
  const extras = selected.filter(
    (v) => v !== "Multiplayer" && v !== "Singleplayer" && !options.includes(v)
  );

  const toggle = (value: string) => {
    onChange(
      chosen.has(value) ? selected.filter((v) => v !== value) : [...selected, value]
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          {label}
        </label>
        <span className="text-xs text-muted-foreground">
          {selected.length > 0 ? `${selected.length} selected` : "none"}
        </span>
      </div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <ChipToggle
            key={option}
            label={option}
            on={chosen.has(option)}
            onClick={() => toggle(option)}
          />
        ))}
        {extras.map((value) => (
          <ChipToggle
            key={value}
            label={value}
            on
            title="Not in the standard list — click to remove"
            onClick={() => onChange(selected.filter((v) => v !== value))}
          />
        ))}
      </div>
    </div>
  );
}
