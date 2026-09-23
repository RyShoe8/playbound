"use client";

import { useSyncExternalStore } from "react";
import type { LauncherOs } from "@/lib/launcherDownload";
import { detectLauncherOs } from "@/lib/openPlayboundDeepLink";

const subscribe = () => () => {};
const serverSnapshot = (): LauncherOs => "windows";

export function useLauncherOs(): LauncherOs {
  return useSyncExternalStore(subscribe, detectLauncherOs, serverSnapshot);
}
