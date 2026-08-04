"use client";

import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useTelemetry } from "@/lib/telemetry";

type Props = {
  className?: string;
  label?: string;
};

export function SignOutButton({ className, label = "Sign out" }: Props) {
  const { track } = useTelemetry();

  return (
    <button
      type="button"
      onClick={() => {
        void track("logout");
        void signOut({ callbackUrl: "/" });
      }}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      {label}
    </button>
  );
}
