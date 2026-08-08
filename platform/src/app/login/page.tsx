"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { LogIn } from "lucide-react";
import {
  AuthDivider,
  GoogleSignInButton,
  authErrorMessage,
} from "@/components/GoogleSignInButton";
import { RecaptchaNotice } from "@/components/RecaptchaNotice";
import { getRecaptchaToken } from "@/lib/recaptchaClient";
import { useTelemetry } from "@/lib/telemetry";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { track } = useTelemetry();
  const callbackUrl = params.get("callbackUrl") || "/profile";
  // NextAuth redirects OAuth failures back here with ?error=<code>.
  const oauthError = authErrorMessage(params.get("error"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    // Passed through NextAuth into the credentials authorize() callback.
    const recaptchaToken = (await getRecaptchaToken("login")) ?? "";
    const res = await signIn("credentials", {
      email,
      password,
      recaptchaToken,
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      setError(res.error);
    } else {
      void track("login", { method: "credentials" });
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <LogIn className="mx-auto size-8 text-primary" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Sign in to PlayBound</h1>
      </div>

      {oauthError && (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {oauthError}
        </p>
      )}

      <GoogleSignInButton callbackUrl={callbackUrl} label="Sign in with Google" />
      <AuthDivider />

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
          <p className="mt-1.5 text-right text-xs">
            <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="h-10 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <RecaptchaNotice className="mt-4 text-center" />

      <p className="mt-5 text-center text-sm text-muted-foreground">
        New to PlayBound?{" "}
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
