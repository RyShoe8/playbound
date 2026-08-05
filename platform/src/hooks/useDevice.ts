"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { DeviceType } from "@/lib/compatibility/compatibility";

export type DeviceInfo = {
  type: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
};

const BREAKPOINTS = { mobile: 768, tablet: 1024 } as const;
const CHANGE_EVENT = "pb-device-change";

function typeFromClientState(width: number, ua: string): DeviceType {
  const isMac = /Mac OS X|Macintosh/i.test(ua);
  if (width < BREAKPOINTS.mobile) return "mobile";
  if (width < BREAKPOINTS.tablet) return "tablet";
  if (isMac) return "macos";
  return "desktop";
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const notify = () => {
    window.dispatchEvent(new Event(CHANGE_EVENT));
    onChange();
  };

  window.addEventListener("resize", notify);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("resize", notify);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readClientType(): DeviceType {
  return typeFromClientState(window.innerWidth, navigator.userAgent);
}

function toInfo(type: DeviceType): DeviceInfo {
  return {
    type,
    isMobile: type === "mobile",
    isTablet: type === "tablet",
    isDesktop: type === "desktop" || type === "macos",
  };
}

/**
 * Current device class. Viewport breakpoints win on the client;
 * optional `ssrSeed` avoids a wrong first guess before hydrate.
 */
export function useDevice(ssrSeed: DeviceType = "desktop"): DeviceInfo {
  const clientType = useSyncExternalStore(
    subscribe,
    readClientType,
    () => ssrSeed
  );

  const [type, setType] = useState<DeviceType>(clientType);
  useEffect(() => {
    setType(clientType);
  }, [clientType]);

  return toInfo(type);
}
