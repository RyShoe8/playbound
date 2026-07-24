"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CircleAlert, Loader2 } from "lucide-react";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const email = params.get("email");
  const missingParams = !token || !email;
  const [state, setState] = useState<"checking" | "done" | "error">(missingParams ? "error" : "checking");
  const [message, setMessage] = useState(missingParams ? "This verification link is missing information." : "");

  useEffect(() => {
    if (missingParams) return;
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, email }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (res.ok) {
          setState("done");
        } else {
          setState("error");
          setMessage(data?.error ?? "Verification failed.");
        }
      })
      .catch(() => {
        setState("error");
        setMessage("Couldn't reach the server — try again in a moment.");
      });
  }, [token, email, missingParams]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      {state === "checking" && (
        <>
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
        </>
      )}
      {state === "done" && (
        <>
          <BadgeCheck className="size-10 text-play" />
          <h1 className="text-2xl font-extrabold">Email verified</h1>
          <p className="text-sm text-muted-foreground">Your account is active. You can sign in now.</p>
          <Link href="/login" className="mt-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110">
            Sign In
          </Link>
        </>
      )}
      {state === "error" && (
        <>
          <CircleAlert className="size-10 text-destructive" />
          <h1 className="text-2xl font-extrabold">Verification failed</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Link href="/signup" className="text-sm font-semibold text-primary hover:underline">
            Back to sign up
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
