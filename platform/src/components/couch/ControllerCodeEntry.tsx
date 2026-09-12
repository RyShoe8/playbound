"use client";

import { FormEvent, useState, CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { normalizeCouchJoinCode } from "@/lib/couch/joinUrl";

const shell: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  textAlign: "center",
  gap: 12,
  background: "#0b0a10",
  color: "#f4f2fb",
  fontFamily: "system-ui, sans-serif",
};

/**
 * Jackbox-style join: open playbound.club/c, type the short code from the host.
 * No long URLs to type on a phone.
 */
export function ControllerCodeEntry({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(normalizeCouchJoinCode(initialCode));
  const [error, setError] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = normalizeCouchJoinCode(code);
    if (next.length < 4) {
      setError("Enter the code shown on the host PC.");
      return;
    }
    setError("");
    router.push(`/c/${encodeURIComponent(next)}`);
  }

  return (
    <main style={shell}>
      <p style={{ margin: 0, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.55, fontSize: 12 }}>
        PlayBound
      </p>
      <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>Enter code</h1>
      <p style={{ margin: 0, maxWidth: 320, opacity: 0.75, lineHeight: 1.45, fontSize: 14 }}>
        Type the short code from the host screen. Prefer scanning the QR when you can.
      </p>
      <form
        onSubmit={onSubmit}
        style={{ width: "min(100%, 320px)", display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}
      >
        <label htmlFor="pbc-join-code" style={{ textAlign: "left", fontSize: 12, opacity: 0.65 }}>
          Room code
        </label>
        <input
          id="pbc-join-code"
          name="code"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={16}
          value={code}
          onChange={(e) => {
            setCode(normalizeCouchJoinCode(e.target.value));
            setError("");
          }}
          placeholder="AB3D"
          aria-invalid={error ? true : undefined}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "14px 16px",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.14)",
            background: "rgba(255, 255, 255, 0.06)",
            color: "#fff",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.2em",
            textAlign: "center",
            textTransform: "uppercase",
          }}
        />
        {error ? <p style={{ margin: 0, color: "#fca5a5", fontSize: 13 }}>{error}</p> : null}
        <button
          type="submit"
          style={{
            marginTop: 4,
            padding: "14px 16px",
            border: 0,
            borderRadius: 12,
            background: "#3dd68c",
            color: "#04140c",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Join
        </button>
      </form>
    </main>
  );
}
