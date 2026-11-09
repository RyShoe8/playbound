import type { Metadata } from "next";
import { connection } from "next/server";
import dbConnect from "@/lib/db";
import FlightDeviceProfile from "@/lib/models/FlightDeviceProfile";
import { normalizeFlightProfile } from "@/lib/flightDeviceProfile";
import { DeviceProfileReview } from "@/components/admin/DeviceProfileReview";

export const metadata: Metadata = { title: "Flight Devices | Admin" };

const iso = (d: unknown) => (d ? new Date(d as Date).toISOString().slice(0, 16).replace("T", " ") : "—");

export default async function AdminDeviceProfilesPage() {
  // Never prerendered — see the layout.
  await connection();
  await dbConnect();
  const rows = await FlightDeviceProfile.find()
    .sort({ status: 1, lastSubmittedAt: -1 })
    .limit(200)
    .lean<{ vidPid: string; label: string; status: string; submissions: number; lastSubmittedAt?: Date; profile: unknown }[]>();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-extrabold">Flight devices</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Layouts players measured with the launcher&apos;s calibration. Approving one shares it with every launcher, so the
          next owner of that device gets throttle, roll, hat and buttons bound without calibrating. Devices PlayBound ships a
          measured profile for (the T.Flight HOTAS 4) are not listed here.
        </p>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No calibrations submitted yet.</p>}
      <ul className="space-y-3">
        {rows.map((row) => {
          const p = normalizeFlightProfile(row.profile);
          return (
            <li key={row.vidPid} className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  <span className="font-bold">{row.label}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{row.vidPid}</span>{" "}
                  <span className="ml-1 rounded bg-muted px-1.5 text-xs">{row.status}</span>
                </p>
                <DeviceProfileReview vidPid={row.vidPid} status={row.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.submissions} submission{row.submissions === 1 ? "" : "s"} · last {iso(row.lastSubmittedAt)}
              </p>
              {p ? (
                <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  <div><dt className="inline font-semibold">Axes: </dt><dd className="inline">{Object.entries(p.axes).map(([k, v]) => `${k} ${v}`).join(" · ")}</dd></div>
                  <div><dt className="inline font-semibold">Unusable: </dt><dd className="inline">{p.unusableAxes.join(", ") || "none"}</dd></div>
                  <div><dt className="inline font-semibold">Roles: </dt><dd className="inline">{Object.entries(p.roles).map(([r, b]) => `${r} → ${b}`).join(" · ") || "none"}</dd></div>
                  <div><dt className="inline font-semibold">Hat: </dt><dd className="inline">{Object.entries(p.hat).map(([d, r]) => (d === r ? d : `${d}→${r}`)).join(" · ")}</dd></div>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-red-500">Stored profile no longer validates.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
