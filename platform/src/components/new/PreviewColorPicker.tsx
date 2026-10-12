"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "playbound-preview-accent";
const COLORS = [
  ["Red", "#EF0107"],
  ["Orange", "#F97316"],
  ["Teal", "#14B8A6"],
  ["Yellow", "#FACC15"],
  ["Sky blue", "#38BDF8"],
  ["Mint", "#6EE7B7"],
  ["Turquoise", "#40E0D0"],
] as const;

export function PreviewColorPicker() {
  const [color, setColor] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && /^#[0-9a-f]{6}$/i.test(saved)) return saved;
    } catch { /* Storage may be disabled. */ }
    return COLORS[0][1];
  });
  useEffect(() => {
    const root = document.documentElement;
    const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    root.style.setProperty("--preview-color", color);
    root.style.setProperty("--preview-foreground", luminance > 0.179 ? "#15161c" : "#ffffff");
    return () => {
      root.style.removeProperty("--preview-color");
      root.style.removeProperty("--preview-foreground");
    };
  }, [color]);

  function select(next: string) {
    setColor(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Selection still works. */ }
  }

  return <div className="preview-color-picker" role="group" aria-label="Preview accent color">
    <span>Accent</span>
    {COLORS.map(([name, hex]) => <button key={name} type="button" title={name}
      aria-label={name} aria-pressed={color.toLowerCase() === hex.toLowerCase()}
      style={{ backgroundColor: hex }} onClick={() => select(hex)} />)}
    <label className="preview-custom-color">Custom<input type="color" aria-label="Custom accent color"
      value={color} onChange={(event) => select(event.target.value)} /></label>
  </div>;
}
