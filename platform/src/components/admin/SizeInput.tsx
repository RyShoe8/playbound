import { useState, useEffect } from "react";

export function SizeInput({
  value,
  onChange,
  className,
  required,
}: {
  value: number | undefined;
  onChange: (val: number | undefined) => void;
  className?: string;
  required?: boolean;
}) {
  const [text, setText] = useState(value ? String(value) : "");

  useEffect(() => {
    if (value !== undefined && value !== 0) {
      if (parseFloat(text) !== value) {
        setText(String(value));
      }
    } else if (value === undefined || value === 0) {
      if (text && !isNaN(parseFloat(text))) {
        setText("");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleBlur() {
    if (!text.trim()) {
      onChange(undefined);
      return;
    }
    let parsed = parseFloat(text.replace(/,/g, ""));
    if (isNaN(parsed)) {
      onChange(undefined);
      setText("");
      return;
    }
    const lower = text.toLowerCase();
    if (lower.includes("gb") || lower.includes("g")) {
      parsed *= 1024;
    } else if (lower.includes("kb") || lower.includes("k")) {
      parsed /= 1024;
    }
    const mb = Math.round(parsed);
    onChange(mb);
    setText(String(mb));
  }

  return (
    <input
      type="text"
      required={required}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
      className={className}
      placeholder="e.g. 500 or 1.5 GB"
    />
  );
}
