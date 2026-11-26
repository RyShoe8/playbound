"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Users } from "lucide-react";

/** Desktop stays expanded; mobile starts compact without a hydration/layout flash. */
export function PlayTogetherPanel({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <section className="new-panel new-pad home-play-panel" data-expanded={expanded}>
    <h2 className="home-play-desktop-title">Play together</h2>
    <button type="button" className="home-play-toggle" aria-expanded={expanded} aria-controls={id}
      onClick={() => setExpanded(value => !value)}>
      <Users aria-hidden="true" size={22} />
      <span><strong>Play together</strong><small>Share a time. Find your next party.</small></span>
      <ChevronDown aria-hidden="true" size={20} />
    </button>
    <div className="home-play-content" id={id}>{children}</div>
  </section>;
}
