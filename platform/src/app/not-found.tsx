import Link from "next/link";
import { Compass, Gamepad2 } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <Gamepad2 className="size-12 text-primary" />
      <h1 className="text-3xl font-extrabold tracking-tight">Respawn point not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page doesn&apos;t exist — but there are plenty of free games that do.
      </p>
      <Link
        href="/discover"
        className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
      >
        <Compass className="size-4" /> Discover Games
      </Link>
    </div>
  );
}
