import Link from "next/link";

export default function ControllerLandingPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
        gap: 16,
      }}
    >
      <p style={{ letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6, fontSize: 12 }}>
        PlayBound Couch Mode
      </p>
      <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>Controller</h1>
      <p style={{ margin: 0, maxWidth: 360, opacity: 0.8, lineHeight: 1.5 }}>
        Scan the QR code on your PC, or open the link your host shows. No PlayBound account needed on
        this phone.
      </p>
      <Link
        href="/"
        style={{ marginTop: 24, color: "#9ad0ff", textDecoration: "none", fontSize: 14 }}
      >
        Back to PlayBound
      </Link>
    </main>
  );
}
