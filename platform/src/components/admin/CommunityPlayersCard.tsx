"use client";

import { useEffect, useState } from "react";
import { PeriodStatTile } from "@/components/ui/bits";

type Population = {
  current: number | null;
  periods: { day: number; dayPrev: number; week: number; weekPrev: number; month: number; monthPrev: number };
};

export function CommunityPlayersCard() {
  const [population, setPopulation] = useState<Population | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      fetch("/api/admin/connect/game-servers/community-hosting", { signal: controller.signal, cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unavailable")))
        .then((body: { population?: Population }) => setPopulation(body.population || null))
        .catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  return <div className="max-w-md"><PeriodStatTile
    label="Players Online"
    primary={population ? population.current == null ? "—" : String(population.current) : "—"}
    hint="Community servers now · peak concurrent players in 15-minute samples below (tracking starts with this update)"
    periods={population?.periods}
  /></div>;
}
