"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_TZ_COOKIE } from "@/lib/admin/zonedTime";

function browserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Tells the server which timezone the admin is in.
 *
 * Event times are stored in UTC and the tables format them in the browser, but
 * "today", the daily chart and date filters are decided on the server, which
 * only learns the viewer's zone from this cookie. Refreshes once when the
 * cookie first appears or changes so the first load is already correct.
 */
export function AdminTimezoneCookie({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const zone = browserZone();
    if (!zone || zone === current) return;
    try {
      document.cookie = `${ADMIN_TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    } catch {
      /* cookies disabled: reports stay in UTC */
    }
  }, [current, router]);
  return null;
}

/** Hidden form field carrying the viewer's zone for GET filters. */
export function TimezoneField() {
  const [zone, setZone] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZone(browserZone() || "");
  }, []);
  return <input type="hidden" name="tz" value={zone} readOnly />;
}
