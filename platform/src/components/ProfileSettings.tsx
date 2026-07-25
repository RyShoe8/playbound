"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { SignOutButton } from "@/components/SignOutButton";

type Props = {
  initialUsername: string;
  email: string;
};

export function ProfileSettings({ initialUsername, email }: Props) {
  const { update } = useSession();

  const [username, setUsername] = useState(initialUsername);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordErr, setPasswordErr] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileMsg("");
    setProfileErr("");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setProfileErr(data?.error ?? "Couldn’t update profile.");
        return;
      }
      await update({ username: data.username });
      setUsername(data.username);
      setProfileMsg("Username updated.");
    } catch {
      setProfileErr("Couldn’t reach the server.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordBusy(true);
    setPasswordMsg("");
    setPasswordErr("");
    if (newPassword !== confirmPassword) {
      setPasswordErr("New passwords don’t match.");
      setPasswordBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPasswordErr(data?.error ?? "Couldn’t change password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg("Password changed.");
    } catch {
      setPasswordErr("Couldn’t reach the server.");
    } finally {
      setPasswordBusy(false);
    }
  }

  const inputClass =
    "mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-extrabold tracking-tight">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">Update how you appear on PlayBound.</p>
        <form onSubmit={saveProfile} className="mt-4 max-w-md space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Email</label>
            <input type="email" value={email} disabled className={`${inputClass} opacity-70`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Username</label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
            />
          </div>
          {profileErr && <p className="text-xs text-destructive">{profileErr}</p>}
          {profileMsg && <p className="text-xs text-play">{profileMsg}</p>}
          <button
            type="submit"
            disabled={profileBusy}
            className="h-10 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
          >
            {profileBusy ? "Saving…" : "Save username"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-extrabold tracking-tight">Password</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose a new password for your account.</p>
        <form onSubmit={savePassword} className="mt-4 max-w-md space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Current password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">New password</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Confirm new password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </div>
          {passwordErr && <p className="text-xs text-destructive">{passwordErr}</p>}
          {passwordMsg && <p className="text-xs text-play">{passwordMsg}</p>}
          <button
            type="submit"
            disabled={passwordBusy}
            className="h-10 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
          >
            {passwordBusy ? "Updating…" : "Change password"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 sm:hidden">
        <h2 className="text-lg font-extrabold tracking-tight">Session</h2>
        <SignOutButton className="mt-3 rounded-full border border-border bg-secondary px-5 py-2 hover:bg-secondary/70" />
      </section>
    </div>
  );
}
