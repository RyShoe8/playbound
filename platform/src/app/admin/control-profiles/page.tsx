import type { Metadata } from "next";
import { connection } from "next/server";
import dbConnect from "@/lib/db";
import ControlProfile from "@/lib/models/ControlProfile";
import { ControlProfileEditor } from "./ControlProfileEditor";

export const metadata: Metadata = { title: "Control Profiles | Admin" };

export default async function ControlProfilesPage() {
  await connection();
  await dbConnect();
  const profiles = await ControlProfile.find().sort({ updatedAt: -1 }).limit(200).lean();
  const serialized = JSON.parse(JSON.stringify(profiles)) as Array<Record<string, unknown>>;
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold">PlayBound Controls profiles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a game or edition recipe, test it in the launcher, then mark it verified to enable automatic controller mapping for players.
        </p>
      </div>
      <ControlProfileEditor profiles={serialized} />
    </main>
  );
}
